"""Offline regression tests. Isolated SQLite database; never uses real credentials."""
import os
import io
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

_workspace = tempfile.TemporaryDirectory(prefix="securelens-tests-")
os.environ["DATABASE_URL"] = "sqlite:///" + (Path(_workspace.name) / "test.db").as_posix()
os.environ["OPENAI_API_KEY"] = "offline-test-key"

from fastapi.testclient import TestClient
from openai import APITimeoutError, RateLimitError
import httpx2
from app import ai_assessment, auth, evidence_text, main, ocr, schemas
from app.database import Base, engine


# Fictional credential used only inside the temporary test database.
TEST_PASSWORD = "offline-test-password"

SCANNED_SENTENCE = "Accounts are reviewed quarterly by the IT manager."


def scanned_pdf(*lines):
    """An image-only PDF (no text layer), one page per line of text."""
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.load_default(size=44)
    pages = []
    for line in lines:
        page = Image.new("L", (1700, 2200), 255)
        ImageDraw.Draw(page).text((120, 200), line, fill=0, font=font)
        pages.append(page)
    buffer = io.BytesIO()
    pages[0].save(buffer, format="PDF", resolution=200, save_all=True, append_images=pages[1:])
    return buffer.getvalue()


def screenshot(text, image_format="PNG", size=(900, 120)):
    """A small screenshot-like image containing one line of text."""
    from PIL import Image, ImageDraw, ImageFont
    image = Image.new("RGB", size, "white")
    ImageDraw.Draw(image).text((20, 40), text, fill="black", font=ImageFont.load_default(size=22))
    buffer = io.BytesIO()
    image.save(buffer, format=image_format)
    return buffer.getvalue()


def text_pdf(sentence="Manager approval is required."):
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=300)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 20 250 Td (" + sentence.encode() + b") Tj ET")
    page[NameObject("/Contents")] = stream
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def merged_pdf(*documents):
    from pypdf import PdfReader, PdfWriter
    writer = PdfWriter()
    for document in documents:
        for page in PdfReader(io.BytesIO(document)).pages:
            writer.add_page(page)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def with_ocr(**run_tesseract):
    """Pretend Tesseract is installed; run_tesseract is mocked."""
    available = patch.object(ocr, "tesseract_path", return_value="tesseract")
    reader = patch.object(ocr, "run_tesseract", **run_tesseract)
    return available, reader


def tearDownModule():
    engine.dispose()
    _workspace.cleanup()


def result():
    return schemas.AIAssessmentResult(
        suggestedStatus="Partially Met", confidence="Medium",
        reasoning="Approval is documented; account review is missing.",
        evidenceFound=["policy.txt: Manager approval is required."],
        gaps=["Periodic review is not documented."],
    )


class AIServiceTests(unittest.TestCase):
    def setUp(self):
        self.control = SimpleNamespace(code="AC-2", name="Account Management",
                                       family="Access Control", description="Approve and review accounts.")
        self.evidence = [SimpleNamespace(original_filename="policy.txt", extracted_text="Manager approval required.")]

    def test_structured_request_and_sources(self):
        with patch.object(ai_assessment, "OpenAI") as factory:
            client = factory.return_value.__enter__.return_value
            client.responses.parse.return_value = SimpleNamespace(status="completed", output=[], output_parsed=result())
            assessment, files = ai_assessment.analyze_control_evidence(self.control, self.evidence)
            self.assertEqual(assessment.suggestedStatus, "Partially Met")
            self.assertEqual(files, ["policy.txt"])
            request = client.responses.parse.call_args.kwargs
            self.assertEqual(request["model"], "gpt-5.6-luna")
            self.assertFalse(request["store"])
            self.assertIn("Manager approval required.", request["input"])
            self.assertIs(request["text_format"], schemas.AIAssessmentResult)

    def test_limits_never_silently_omit_evidence(self):
        self.evidence[0].extracted_text = "x" * ai_assessment.MAX_AI_EVIDENCE_CHARS
        self.assertEqual(len(ai_assessment.build_evidence_text(self.evidence)[1]), 1)
        self.evidence.append(SimpleNamespace(original_filename="extra.txt", extracted_text="One more fact"))
        with self.assertRaisesRegex(ValueError, "limit"):
            ai_assessment.build_evidence_text(self.evidence)

    def test_empty_evidence_does_not_call_provider(self):
        self.evidence[0].extracted_text = "  "
        with patch.object(ai_assessment, "OpenAI") as factory:
            with self.assertRaises(ValueError):
                ai_assessment.analyze_control_evidence(self.control, self.evidence)
            factory.assert_not_called()

    def test_missing_key(self):
        with patch.object(ai_assessment.settings, "openai_api_key", None):
            with self.assertRaises(ai_assessment.AIServiceError) as caught:
                ai_assessment.analyze_control_evidence(self.control, self.evidence)
            self.assertEqual(caught.exception.status_code, 503)

    def test_refusal_incomplete_and_missing_output(self):
        refusal = SimpleNamespace(type="message", content=[SimpleNamespace(type="refusal")])
        for status, output, parsed in [("incomplete", [], result()), ("completed", [refusal], None), ("completed", [], None)]:
            with self.subTest(status=status, output=output), patch.object(ai_assessment, "OpenAI") as factory:
                factory.return_value.__enter__.return_value.responses.parse.return_value = SimpleNamespace(
                    status=status, output=output, output_parsed=parsed)
                with self.assertRaises(ai_assessment.AIServiceError):
                    ai_assessment.analyze_control_evidence(self.control, self.evidence)

    def test_provider_failures_are_sanitized(self):
        request = httpx2.Request("POST", "https://api.openai.com/v1/responses")
        errors = [(APITimeoutError(request=request), 504),
                  (RateLimitError("secret provider body", response=httpx2.Response(429, request=request), body=None), 429)]
        for error, expected_status in errors:
            with self.subTest(error=type(error).__name__), patch.object(ai_assessment, "OpenAI") as factory:
                factory.return_value.__enter__.return_value.responses.parse.side_effect = error
                with self.assertRaises(ai_assessment.AIServiceError) as caught:
                    ai_assessment.analyze_control_evidence(self.control, self.evidence)
                self.assertEqual(caught.exception.status_code, expected_status)
                self.assertNotIn("secret provider body", str(caught.exception))


class SearchUnitTests(unittest.TestCase):
    def test_terms_and_phrases(self):
        from app.search import parse_terms
        self.assertEqual(parse_terms('MFA  "Access   Reviews" mfa a'), ["mfa", "access reviews"])
        self.assertEqual(len(parse_terms(" ".join(f"term{i}" for i in range(20)))), 8)

    def test_snippet_is_short_and_centered_on_the_match(self):
        from app.search import SNIPPET_LENGTH, make_snippet
        text = ("filler words here " * 60) + "The firewall\nblocks inbound traffic. " + ("more text " * 60)
        snippet = make_snippet(text, ["firewall"])
        self.assertTrue(snippet.startswith("…") and snippet.endswith("…"))
        self.assertIn("The firewall blocks inbound traffic.", snippet)  # newlines collapsed
        self.assertLessEqual(len(snippet), SNIPPET_LENGTH + 2)
        self.assertEqual(make_snippet("Short text.", ["short"]), "Short text.")


class OCRUnitTests(unittest.TestCase):
    def test_ai_is_told_when_text_came_from_ocr(self):
        scanned = SimpleNamespace(original_filename="scan.pdf", extracted_text="Reviewed.", extraction_method="ocr")
        typed = SimpleNamespace(original_filename="policy.txt", extracted_text="Approved.", extraction_method="text")
        text, files = ai_assessment.build_evidence_text([scanned, typed])
        self.assertEqual(files, ["scan.pdf", "policy.txt"])
        self.assertEqual(text.count("Text source: OCR"), 1)
        self.assertLess(text.index("Text source: OCR"), text.index("policy.txt"))

    def test_language_setting_cannot_inject_options(self):
        with patch.object(ocr, "tesseract_path", return_value="tesseract"), \
                patch.object(ocr.settings, "ocr_languages", "--user-words /etc/passwd"), \
                patch.object(ocr.subprocess, "run") as run:
            with self.assertRaises(ocr.OCRError):
                ocr.run_tesseract(b"png")
        run.assert_not_called()

    def test_tesseract_errors_become_ocr_errors(self):
        import subprocess
        with patch.object(ocr, "tesseract_path", return_value="tesseract"):
            with patch.object(ocr.subprocess, "run", side_effect=subprocess.TimeoutExpired("tesseract", 30)):
                with self.assertRaisesRegex(ocr.OCRError, "timed out"):
                    ocr.run_tesseract(b"png")
            failed = SimpleNamespace(returncode=1, stdout=b"", stderr=b"Error opening data file")
            with patch.object(ocr.subprocess, "run", return_value=failed):
                with self.assertRaisesRegex(ocr.OCRError, "Error opening data file"):
                    ocr.run_tesseract(b"png")


@unittest.skipUnless(shutil.which("tesseract"), "Tesseract is not installed")
class RealOCRTests(unittest.TestCase):
    """Runs the real Tesseract program (in CI and the Docker image)."""

    def test_reads_a_scanned_page(self):
        ocr.tesseract_path.cache_clear()
        path = Path(_workspace.name) / "real-scan.pdf"
        path.write_bytes(scanned_pdf(SCANNED_SENTENCE))
        extracted = evidence_text.extract_evidence_text(path, ".pdf")
        self.assertEqual(extracted.method, "ocr")
        self.assertIn("reviewed quarterly", extracted.text.lower())

    def test_reads_a_screenshot(self):
        ocr.tesseract_path.cache_clear()
        path = Path(_workspace.name) / "real-screenshot.png"
        path.write_bytes(screenshot(SCANNED_SENTENCE))
        extracted = evidence_text.extract_evidence_text(path, ".png")
        self.assertEqual(extracted.method, "ocr")
        self.assertIn("reviewed quarterly", extracted.text.lower())


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        auth.login_throttle.reset()
        self.uploads = tempfile.TemporaryDirectory(dir=_workspace.name)
        self.storage = patch.object(main, "UPLOAD_DIR", Path(self.uploads.name))
        self.storage.start()
        # Same result on every machine: no OCR unless a test turns it on.
        self.no_ocr = patch.object(ocr, "tesseract_path", return_value=None)
        self.no_ocr.start()
        self.client = TestClient(main.app)
        setup = self.client.post("/auth/setup", json={"username": "admin", "password": TEST_PASSWORD})
        self.assertEqual(setup.status_code, 201, setup.text)
        self.client.headers["Authorization"] = "Bearer " + setup.json()["token"]
        response = self.client.post("/systems", json={"name": "Northstar Employee Portal", "owner": "IT", "environment": "Test"})
        self.assertEqual(response.status_code, 201, response.text)
        self.system_url = f"/systems/{response.json()['id']}"
        response = self.client.post(self.system_url + "/controls", json=[{
            "code": "AC-2", "name": "Account Management", "family": "Access Control",
            "description": "Approve and periodically review accounts.",
        }])
        self.assertEqual(response.status_code, 201, response.text)
        self.control_url = self.system_url + "/controls/AC-2"

    def tearDown(self):
        self.client.close()
        self.no_ocr.stop()
        self.storage.stop()
        self.uploads.cleanup()

    def upload(self, content=b"Manager approval required.", filename="policy.txt", mime="text/plain"):
        return self.client.post(self.control_url + "/evidence", files={"file": (filename, content, mime)})

    def test_upload_analyze_review_save_and_delete(self):
        evidence = self.upload()
        self.assertEqual(evidence.status_code, 201, evidence.text)
        self.assertEqual(evidence.json()["extractionStatus"], "completed")
        evidence_url = f"/evidence/{evidence.json()['id']}"
        self.assertIn("Manager approval", self.client.get(evidence_url + "/text").json()["extractedText"])
        with patch.object(main, "analyze_control_evidence", return_value=(result(), ["policy.txt"])):
            suggestion = self.client.post(self.control_url + "/analyze")
        self.assertEqual(suggestion.status_code, 200, suggestion.text)
        system = self.client.get(self.system_url).json()
        self.assertEqual(system["controls"][0]["status"], "Not Assessed")
        self.assertEqual(system["progress"], 0)
        saved = self.client.put(self.control_url, json={"status": suggestion.json()["suggestedStatus"], "analystNotes": "Reviewed by analyst"})
        self.assertEqual(saved.status_code, 200, saved.text)
        system = self.client.get(self.system_url).json()
        self.assertEqual(system["progress"], 100)
        self.assertEqual(system["risk"], "Medium")
        self.assertEqual(self.client.delete(evidence_url).status_code, 204)
        self.assertEqual(self.client.get(evidence_url + "/download").status_code, 404)
        self.assertEqual(self.client.post(self.control_url + "/analyze").status_code, 400)

    def test_no_text_and_failed_pdf_do_not_call_ai(self):
        for payload, filename, mime in [(b"  ", "empty.txt", "text/plain"), (b"invalid", "bad.pdf", "application/pdf")]:
            with self.subTest(filename=filename):
                self.assertEqual(self.upload(payload, filename, mime).status_code, 201)
        with patch.object(main, "analyze_control_evidence") as analyze:
            self.assertEqual(self.client.post(self.control_url + "/analyze").status_code, 400)
            analyze.assert_not_called()

    def test_pdf_text_extraction(self):
        available, reader = with_ocr()
        with available, reader as run_tesseract:
            response = self.upload(text_pdf(), "policy.pdf", "application/pdf")
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["extractionStatus"], "completed")
        self.assertEqual(response.json()["extractionMethod"], "text")
        run_tesseract.assert_not_called()  # a text layer needs no OCR
        text = self.client.get(f"/evidence/{response.json()['id']}/text").json()["extractedText"]
        self.assertIn("Manager approval is required.", text)

    def test_scanned_pdf_is_read_with_ocr(self):
        available, reader = with_ocr(return_value=SCANNED_SENTENCE)
        with available, reader as run_tesseract:
            response = self.upload(scanned_pdf(SCANNED_SENTENCE), "scan.pdf", "application/pdf")
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual((body["extractionStatus"], body["extractionMethod"], body["extractionNote"]),
                         ("completed", "ocr", ""))
        image = run_tesseract.call_args.args[0]
        self.assertTrue(image.startswith(b"\x89PNG"))  # a rendered page image
        text = self.client.get(f"/evidence/{body['id']}/text").json()
        self.assertEqual(text["extractedText"], SCANNED_SENTENCE)
        self.assertEqual(text["extractionMethod"], "ocr")
        upload_row = self.client.get("/activity", params={"category": "evidence"}).json()[0]
        self.assertIn("text: completed, ocr", upload_row["summary"])
        methods = []

        def fake_analyze(control, evidence_items):
            methods.extend(item.extraction_method for item in evidence_items)
            return result(), ["scan.pdf"]

        with patch.object(main, "analyze_control_evidence", side_effect=fake_analyze):
            self.assertEqual(self.client.post(self.control_url + "/analyze").status_code, 200)
        self.assertEqual(methods, ["ocr"])

    def test_mixed_pdf_only_sends_scanned_pages_to_ocr(self):
        document = merged_pdf(text_pdf(), scanned_pdf(SCANNED_SENTENCE))
        available, reader = with_ocr(return_value=SCANNED_SENTENCE)
        with available, reader as run_tesseract:
            body = self.upload(document, "mixed.pdf", "application/pdf").json()
        self.assertEqual(run_tesseract.call_count, 1)
        self.assertEqual(body["extractionMethod"], "text+ocr")
        self.assertEqual(body["extractionNote"], "OCR was used for page 2")
        text = self.client.get(f"/evidence/{body['id']}/text").json()["extractedText"]
        self.assertEqual(text, "Manager approval is required.\n\n" + SCANNED_SENTENCE)

    def test_scanned_pdf_without_ocr_can_be_extracted_later(self):
        self.assertFalse(self.client.get("/health").json()["ocrAvailable"])
        body = self.upload(scanned_pdf(SCANNED_SENTENCE), "scan.pdf", "application/pdf").json()
        self.assertEqual((body["extractionStatus"], body["extractionMethod"]), ("empty", None))
        self.assertEqual(body["extractionNote"], "No text layer was found and OCR is not available on the server")
        self.assertEqual(self.client.post(self.control_url + "/analyze").status_code, 400)

        viewer = self.as_user("viewer4", "viewer")
        extract_url = f"/evidence/{body['id']}/extract"
        self.assertEqual(self.client.post(extract_url, headers=viewer).status_code, 403)
        self.assertEqual(self.client.post("/evidence/9999/extract").status_code, 404)

        available, reader = with_ocr(return_value=SCANNED_SENTENCE)
        with available, reader:
            self.assertTrue(self.client.get("/health").json()["ocrAvailable"])
            again = self.client.post(extract_url)
        self.assertEqual(again.status_code, 200, again.text)
        self.assertEqual((again.json()["extractionStatus"], again.json()["extractionMethod"],
                          again.json()["extractionNote"]), ("completed", "ocr", ""))
        row = self.client.get("/activity", params={"category": "evidence"}).json()[0]
        self.assertEqual(row["action"], "evidence.extract")
        self.assertIn('"scan.pdf"', row["summary"])

    def test_ocr_failures_and_page_limit_are_reported(self):
        available, reader = with_ocr(side_effect=ocr.OCRError("Tesseract timed out."))
        with available, reader:
            body = self.upload(scanned_pdf(SCANNED_SENTENCE), "scan.pdf", "application/pdf").json()
        self.assertEqual((body["extractionStatus"], body["extractionNote"]),
                         ("empty", "OCR could not read page 1"))

        available, reader = with_ocr(return_value=SCANNED_SENTENCE)
        with available, reader as run_tesseract, patch.object(evidence_text, "MAX_OCR_PAGES", 1):
            body = self.upload(scanned_pdf("one", "two"), "long.pdf", "application/pdf").json()
        self.assertEqual(run_tesseract.call_count, 1)
        self.assertEqual(body["extractionMethod"], "ocr")
        self.assertIn("OCR could not read page 2", body["extractionNote"])
        self.assertIn("OCR stopped at its limit", body["extractionNote"])

    def test_screenshots_and_photos_are_read_with_ocr(self):
        from PIL import Image
        for filename, image_format, sent_type, stored_type in [
            ("mfa-settings.png", "PNG", "application/octet-stream", "image/png"),
            ("badge-photo.JPEG", "JPEG", "image/jpeg", "image/jpeg"),
            ("firewall.jpg", "JPEG", "image/pjpeg", "image/jpeg"),
        ]:
            with self.subTest(filename=filename):
                available, reader = with_ocr(return_value="MFA is enforced for all admins.")
                with available, reader as run_tesseract:
                    response = self.upload(screenshot("MFA", image_format), filename, sent_type)
                self.assertEqual(response.status_code, 201, response.text)
                body = response.json()
                self.assertEqual((body["type"], body["extractionStatus"], body["extractionMethod"]),
                                 (stored_type, "completed", "ocr"))
                sent = Image.open(io.BytesIO(run_tesseract.call_args.args[0]))
                self.assertEqual((sent.format, sent.mode, sent.size), ("PNG", "L", (1800, 240)))  # enlarged 2x
                download = self.client.get(f"/evidence/{body['id']}/download")
                self.assertEqual(download.headers["content-type"], stored_type)

    def test_fake_and_mismatched_images_are_rejected(self):
        cases = [
            (b"<html><script>alert(1)</script></html>", "evil.png", "image/png", "not a valid PNG"),
            (screenshot("x", "JPEG"), "renamed.png", "image/png", "not a valid PNG"),
            (screenshot("x", "PNG"), "renamed.jpg", "image/jpeg", "not a valid JPEG"),
            (screenshot("x", "PNG")[:60], "truncated.png", "image/png", "not a valid PNG"),
            (screenshot("x", "PNG"), "page.png", "text/html", "Invalid file type"),
            (screenshot("x", "GIF"), "anim.gif", "image/gif", "Only PDF, TXT, PNG, and JPEG"),
        ]
        for content, filename, mime, message in cases:
            with self.subTest(filename=filename):
                response = self.upload(content, filename, mime)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertIn(message, response.json()["detail"])
        with patch.object(evidence_text, "MAX_IMAGE_PIXELS", 1000):
            response = self.upload(screenshot("x"), "huge.png", "image/png")
        self.assertEqual(response.status_code, 400)
        self.assertIn("too large", response.json()["detail"])
        self.assertEqual(list(Path(self.uploads.name).iterdir()), [])  # nothing left behind
        self.assertEqual(self.client.get(self.control_url + "/evidence").json(), [])

    def test_image_without_ocr_is_kept_with_a_note(self):
        body = self.upload(screenshot("MFA"), "mfa.png", "image/png").json()
        self.assertEqual((body["extractionStatus"], body["extractionMethod"], body["extractionNote"]),
                         ("empty", None, "Images need OCR, which is not available on the server"))
        available, reader = with_ocr(return_value="")
        with available, reader:
            again = self.client.post(f"/evidence/{body['id']}/extract").json()
        self.assertEqual((again["extractionStatus"], again["extractionNote"]),
                         ("empty", "OCR found no text in the image"))

    def search(self, q, expected_status=200, **params):
        response = self.client.get("/evidence/search", params={"q": q, **params})
        self.assertEqual(response.status_code, expected_status, response.text)
        return response.json()

    def add_search_corpus(self):
        files = {
            "mfa-policy.txt": "Multi-factor authentication is required for administrators. "
                              "MFA codes expire after 30 seconds. MFA is reviewed yearly.",
            "backup.txt": "Backups run nightly. Restore tests are performed quarterly.",
            "access-review.txt": "Quarterly access reviews are approved by the manager. "
                                 "100% of accounts were reviewed.",
        }
        for filename, content in files.items():
            self.assertEqual(self.upload(content.encode(), filename).status_code, 201)

    def test_evidence_search_finds_text_across_files(self):
        self.add_search_corpus()
        found = self.search("MFA")
        self.assertEqual(found["terms"], ["mfa"])
        self.assertEqual([item["name"] for item in found["results"]], ["mfa-policy.txt"])
        hit = found["results"][0]
        self.assertEqual((hit["matches"], hit["controlCode"], hit["systemName"]),
                         (2, "AC-2", "Northstar Employee Portal"))
        self.assertIn("MFA codes expire", hit["snippet"])
        self.assertFalse(found["truncated"])

        quarterly = {item["name"] for item in self.search("quarterly")["results"]}
        self.assertEqual(quarterly, {"backup.txt", "access-review.txt"})
        # Every term must match, in any order.
        self.assertEqual([item["name"] for item in self.search("RESTORE quarterly")["results"]], ["backup.txt"])
        self.assertEqual(self.search("quarterly encryption")["results"], [])
        # Quoted phrases match as a whole.
        self.assertEqual([item["name"] for item in self.search('"access reviews"')["results"]], ["access-review.txt"])
        self.assertEqual(self.search('"reviews access"')["results"], [])
        # A filename-only match has no snippet.
        policy = self.search("policy")["results"][0]
        self.assertEqual((policy["name"], policy["matches"], policy["snippet"]), ("mfa-policy.txt", 0, ""))

    def test_evidence_search_treats_wildcards_literally(self):
        self.add_search_corpus()
        self.assertEqual([item["name"] for item in self.search("100%")["results"]], ["access-review.txt"])
        self.assertEqual(self.search("%%")["results"], [])
        self.assertEqual(self.search("a_c")["results"], [])  # "_" is not "any character"
        self.upload(b"Logs are kept in C:\\Logs\\Audit for a year.", "paths.txt")
        self.assertEqual([item["name"] for item in self.search("c:\\logs\\audit")["results"]], ["paths.txt"])
        self.assertEqual(self.search("c:\\logs\\%")["results"], [])

    def test_evidence_search_filters_ranks_and_limits(self):
        self.add_search_corpus()
        other = self.client.post("/systems", json={"name": "Payroll", "owner": "HR", "environment": "Production"}).json()
        self.client.post(f"/systems/{other['id']}/controls", json=[{
            "code": "CP-9", "name": "System Backup", "family": "Contingency Planning", "description": "Back up data.",
        }])
        response = self.client.post(f"/systems/{other['id']}/controls/CP-9/evidence",
                                    files={"file": ("restore.txt", b"Restore restore restore quarterly.", "text/plain")})
        self.assertEqual(response.status_code, 201)

        ranked = self.search("restore")["results"]
        self.assertEqual([item["name"] for item in ranked], ["restore.txt", "backup.txt"])  # most matches first
        only_other = self.search("restore", systemId=other["id"])["results"]
        self.assertEqual([(item["name"], item["systemName"]) for item in only_other], [("restore.txt", "Payroll")])
        self.assertEqual(len(self.search("restore", limit=1)["results"]), 1)
        with patch("app.search.MAX_CANDIDATES", 1):
            self.assertTrue(self.search("restore")["truncated"])

    def test_evidence_search_validation_and_access(self):
        self.add_search_corpus()
        self.search("a", expected_status=422)
        self.assertIn("two or more characters", self.search("a b", expected_status=422)["detail"])
        self.search("mfa", expected_status=422, limit=51)
        self.search("x" * 201, expected_status=422)
        viewer = self.as_user("viewer6", "viewer")
        response = self.client.get("/evidence/search", params={"q": "mfa"}, headers=viewer)
        self.assertEqual(response.status_code, 200)
        with TestClient(main.app) as anonymous:
            self.assertEqual(anonymous.get("/evidence/search", params={"q": "mfa"}).status_code, 401)

    def test_ocr_text_is_searchable(self):
        available, reader = with_ocr(return_value=SCANNED_SENTENCE)
        with available, reader:
            self.upload(scanned_pdf(SCANNED_SENTENCE), "scan.pdf", "application/pdf")
        hit = self.search("IT manager")["results"][0]
        self.assertEqual((hit["name"], hit["extractionMethod"]), ("scan.pdf", "ocr"))

    def test_unreadable_file_reextraction_reports_failure(self):
        body = self.upload(b"invalid", "bad.pdf", "application/pdf").json()
        self.assertEqual(body["extractionStatus"], "failed")
        again = self.client.post(f"/evidence/{body['id']}/extract")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()["extractionStatus"], "failed")

    def test_invalid_file_and_oversize_cleanup(self):
        self.assertEqual(self.upload(b"exe", "bad.exe").status_code, 400)
        with patch.object(main, "MAX_EVIDENCE_SIZE", 3):
            self.assertEqual(self.upload(b"too large").status_code, 413)
        self.assertEqual(list(Path(self.uploads.name).iterdir()), [])

    def test_ai_failure_does_not_modify_saved_assessment(self):
        self.upload()
        self.client.put(self.control_url, json={"status": "Met", "analystNotes": "Keep this"})
        with patch.object(main, "analyze_control_evidence", side_effect=ai_assessment.AIServiceError("Try again", 429)):
            response = self.client.post(self.control_url + "/analyze")
        self.assertEqual(response.status_code, 429)
        control = self.client.get(self.system_url).json()["controls"][0]
        self.assertEqual(control["status"], "Met")
        self.assertEqual(control["analystNotes"], "Keep this")

    def test_cross_system_and_invalid_status(self):
        self.assertEqual(self.client.post("/systems/999/controls/AC-2/analyze").status_code, 404)
        self.assertEqual(self.client.put(self.control_url, json={"status": "Approved"}).status_code, 422)

    def test_blank_input_is_rejected(self):
        for payload in [{"name": "  ", "owner": "IT", "environment": "Test"},
                        {"name": "App", "owner": "", "environment": "Test"},
                        {"name": "x" * 201, "owner": "IT", "environment": "Test"}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/systems", json=payload).status_code, 422)
        bad_control = [{"code": " ", "name": "N", "family": "F", "description": "D"}]
        self.assertEqual(self.client.post(self.system_url + "/controls", json=bad_control).status_code, 422)

    def test_update_system_details(self):
        response = self.client.put(self.system_url, json={"name": "  Renamed Portal ", "description": "Updated"})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["name"], "Renamed Portal")
        self.assertEqual(body["owner"], "IT")
        self.assertEqual(body["description"], "Updated")
        self.assertEqual(len(body["controls"]), 1)
        self.assertEqual(self.client.put(self.system_url, json={"name": ""}).status_code, 422)
        self.assertEqual(self.client.put("/systems/999", json={"name": "Missing"}).status_code, 404)

    def test_assessment_history_records_saved_changes(self):
        history_url = self.control_url + "/history"
        self.assertEqual(self.client.get(history_url).json(), [])
        self.client.put(self.control_url, json={"status": "Partially Met", "analystNotes": "First pass"})
        self.client.put(self.control_url, json={"status": "Partially Met", "analystNotes": "First pass"})  # no change
        self.client.put(self.control_url, json={"status": "Met", "findings": "Review evidence added"})
        history = self.client.get(history_url).json()
        self.assertEqual([(row["previousStatus"], row["newStatus"]) for row in history],
                         [("Partially Met", "Met"), ("Not Assessed", "Partially Met")])
        self.assertEqual(history[0]["findings"], "Review evidence added")
        self.assertEqual(history[1]["analystNotes"], "First pass")
        with patch.object(main, "analyze_control_evidence", return_value=(result(), ["policy.txt"])):
            self.upload()
            self.client.post(self.control_url + "/analyze")
        self.assertEqual(len(self.client.get(history_url).json()), 2, "AI analysis must not create history")
        self.assertEqual(self.client.delete(self.control_url).status_code, 204)
        self.assertEqual(self.client.get(history_url).status_code, 404)
        from app import models
        from app.database import SessionLocal
        with SessionLocal() as db:
            self.assertEqual(db.query(models.AssessmentHistory).count(), 0)

    def test_history_records_who_saved(self):
        self.client.put(self.control_url, json={"status": "Met"})
        self.assertEqual(self.client.get(self.control_url + "/history").json()[0]["changedBy"], "admin")

    def login(self, username, password=TEST_PASSWORD):
        response = self.client.post("/auth/login", json={"username": username, "password": password})
        return response

    def as_user(self, username, role):
        created = self.client.post("/users", json={"username": username, "password": TEST_PASSWORD, "role": role})
        self.assertEqual(created.status_code, 201, created.text)
        token = self.login(username).json()["token"]
        return {"Authorization": "Bearer " + token}

    def test_endpoints_require_sign_in(self):
        anonymous = TestClient(main.app)
        try:
            for method, url in [("get", "/systems"), ("get", self.system_url), ("put", self.control_url),
                                ("post", self.control_url + "/analyze"), ("get", "/evidence/1/download"),
                                ("get", "/users"), ("get", "/auth/me")]:
                with self.subTest(url=url, method=method):
                    self.assertEqual(getattr(anonymous, method)(url).status_code, 401)
            self.assertEqual(anonymous.get("/health").status_code, 200)
            self.assertFalse(anonymous.get("/auth/status").json()["setupRequired"])
            bogus = anonymous.get("/systems", headers={"Authorization": "Bearer not-a-real-token"})
            self.assertEqual(bogus.status_code, 401)
        finally:
            anonymous.close()

    def test_setup_only_once_and_login_errors_are_generic(self):
        again = self.client.post("/auth/setup", json={"username": "second", "password": TEST_PASSWORD})
        self.assertEqual(again.status_code, 409)
        wrong_password = self.login("admin", "wrong-password-123")
        unknown_user = self.login("nobody", "wrong-password-123")
        self.assertEqual(wrong_password.status_code, 401)
        self.assertEqual(wrong_password.json(), unknown_user.json())
        self.assertEqual(self.login("admin").status_code, 200)

    def test_passwords_and_tokens_are_not_stored_in_plain_text(self):
        token = self.login("admin").json()["token"]
        from app import models
        from app.database import SessionLocal
        with SessionLocal() as db:
            user = db.query(models.User).filter_by(username="admin").one()
            self.assertNotIn(TEST_PASSWORD, user.password_hash)
            self.assertTrue(user.password_hash.startswith("scrypt$"))
            self.assertNotIn(token, [session.token_hash for session in user.sessions])

    def test_logout_and_expiry_revoke_access(self):
        token = self.login("admin").json()["token"]
        headers = {"Authorization": "Bearer " + token}
        self.assertEqual(self.client.post("/auth/logout", headers=headers).status_code, 204)
        self.assertEqual(self.client.get("/systems", headers=headers).status_code, 401)
        token = self.login("admin").json()["token"]
        from datetime import datetime, timedelta, timezone
        from app import models
        from app.database import SessionLocal
        with SessionLocal() as db:
            for session in db.query(models.UserSession).all():
                session.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
            db.commit()
        response = self.client.get("/systems", headers={"Authorization": "Bearer " + token})
        self.assertEqual(response.status_code, 401)
        self.assertIn("expired", response.json()["detail"])

    def test_roles_limit_actions(self):
        viewer = self.as_user("viewer1", "viewer")
        analyst = self.as_user("analyst1", "analyst")
        self.assertEqual(self.client.get(self.system_url, headers=viewer).status_code, 200)
        self.assertEqual(self.client.put(self.control_url, json={"status": "Met"}, headers=viewer).status_code, 403)
        self.assertEqual(self.client.post(self.control_url + "/analyze", headers=viewer).status_code, 403)
        self.assertEqual(self.client.post("/systems", json={"name": "X", "owner": "Y", "environment": "Z"},
                                          headers=viewer).status_code, 403)
        self.assertEqual(self.client.put(self.control_url, json={"status": "Met"}, headers=analyst).status_code, 200)
        self.assertEqual(self.client.get("/users", headers=analyst).status_code, 403)
        self.assertEqual(self.client.post("/users", json={"username": "sneaky", "password": TEST_PASSWORD, "role": "admin"},
                                          headers=analyst).status_code, 403)

    def test_user_management_rules(self):
        weak = self.client.post("/users", json={"username": "short", "password": "too-short", "role": "analyst"})
        self.assertEqual(weak.status_code, 422)
        self.assertEqual(self.client.post("/users", json={"username": "bad name!", "password": TEST_PASSWORD}).status_code, 422)
        created = self.client.post("/users", json={"username": "analyst2", "password": TEST_PASSWORD, "role": "analyst"})
        self.assertEqual(created.status_code, 201)
        self.assertNotIn("password", str(created.json()).lower())
        self.assertEqual(self.client.post("/users", json={"username": "analyst2", "password": TEST_PASSWORD}).status_code, 409)
        users = {row["username"]: row["id"] for row in self.client.get("/users").json()}
        self.assertEqual(self.client.put(f"/users/{users['admin']}", json={"role": "viewer"}).status_code, 409)
        self.assertEqual(self.client.delete(f"/users/{users['admin']}").status_code, 409)
        other_token = self.login("analyst2").json()["token"]
        reset = self.client.put(f"/users/{users['analyst2']}", json={"password": "a-brand-new-password"})
        self.assertEqual(reset.status_code, 200)
        self.assertEqual(self.client.get("/systems", headers={"Authorization": "Bearer " + other_token}).status_code, 401)
        self.assertEqual(self.client.delete(f"/users/{users['analyst2']}").status_code, 204)
        self.assertEqual(self.login("analyst2", "a-brand-new-password").status_code, 401)

    def test_health_reports_ai_configuration_without_secret(self):
        body = self.client.get("/health").json()
        self.assertTrue(body["aiConfigured"])
        self.assertNotIn("offline-test-key", str(body))

    def test_repeated_failed_sign_ins_are_throttled(self):
        limit = auth.LoginThrottle.MAX_PER_ACCOUNT
        for _ in range(limit):
            self.assertEqual(self.login("admin", "wrong-password-123").status_code, 401)
        blocked = self.login("admin")  # even the right password is refused while blocked
        self.assertEqual(blocked.status_code, 429)
        self.assertGreater(int(blocked.headers["Retry-After"]), 0)
        self.assertEqual(self.login("ADMIN", "wrong-password-123").status_code, 429)  # case-insensitive key
        # Another account from the same address is unaffected.
        self.client.post("/users", json={"username": "analyst3", "password": TEST_PASSWORD, "role": "analyst"})
        self.assertEqual(self.login("analyst3").status_code, 200)
        # After the window passes the account can sign in again.
        from datetime import datetime, timedelta, timezone
        later = datetime.now(timezone.utc) + auth.LoginThrottle.WINDOW + timedelta(seconds=1)
        with patch.object(auth, "datetime", wraps=datetime) as clock:
            clock.now.return_value = later
            self.assertEqual(self.login("admin").status_code, 200)

    def test_successful_sign_in_clears_failures(self):
        for _ in range(auth.LoginThrottle.MAX_PER_ACCOUNT - 1):
            self.login("admin", "wrong-password-123")
        self.assertEqual(self.login("admin").status_code, 200)
        self.assertEqual(self.login("admin", "wrong-password-123").status_code, 401)

    def test_users_can_change_their_own_password(self):
        other = self.login("admin").json()["token"]
        wrong = self.client.post("/auth/password", json={"currentPassword": "not-it-at-all", "newPassword": "new-password-456"})
        self.assertEqual(wrong.status_code, 400)
        same = self.client.post("/auth/password", json={"currentPassword": TEST_PASSWORD, "newPassword": TEST_PASSWORD})
        self.assertEqual(same.status_code, 400)
        weak = self.client.post("/auth/password", json={"currentPassword": TEST_PASSWORD, "newPassword": "short"})
        self.assertEqual(weak.status_code, 422)
        changed = self.client.post("/auth/password", json={"currentPassword": TEST_PASSWORD, "newPassword": "new-password-456"})
        self.assertEqual(changed.status_code, 204, changed.text)
        self.assertEqual(self.client.get("/systems").status_code, 200)  # this session stays signed in
        self.assertEqual(self.client.get("/systems", headers={"Authorization": "Bearer " + other}).status_code, 401)
        self.assertEqual(self.login("admin").status_code, 401)
        self.assertEqual(self.login("admin", "new-password-456").status_code, 200)
        viewer = self.as_user("viewer2", "viewer")
        own = self.client.post("/auth/password", headers=viewer,
                               json={"currentPassword": TEST_PASSWORD, "newPassword": "viewer-password-789"})
        self.assertEqual(own.status_code, 204)

    def activity(self, **params):
        response = self.client.get("/activity", params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_activity_log_records_who_did_what(self):
        self.login("admin", "wrong-password-123")
        self.client.put(self.control_url, json={"status": "Met"})
        self.client.put(self.control_url, json={"status": "Met"})  # no change: no entry
        evidence = self.upload().json()
        with patch.object(main, "analyze_control_evidence", return_value=(result(), ["policy.txt"])):
            self.client.post(self.control_url + "/analyze")
        self.client.delete(f"/evidence/{evidence['id']}")
        self.client.put(self.system_url, json={"owner": "Security"})
        self.client.post("/users", json={"username": "analyst4", "password": TEST_PASSWORD, "role": "analyst"})
        self.client.delete(self.system_url)
        rows = self.activity()
        actions = [row["action"] for row in reversed(rows)]
        self.assertEqual(actions, [
            "auth.setup", "system.create", "control.add", "auth.login_failed",
            "control.assess", "evidence.upload", "ai.analyze", "evidence.delete", "system.update",
            "user.create", "system.delete",
        ])
        by_action = {row["action"]: row for row in rows}
        self.assertEqual(by_action["control.assess"]["actor"], "admin")
        self.assertIn("Not Assessed → Met", by_action["control.assess"]["summary"])
        self.assertIn("Partially Met", by_action["ai.analyze"]["summary"])
        self.assertIn("owner", by_action["system.update"]["summary"])
        self.assertIn("Northstar Employee Portal", by_action["system.delete"]["summary"])
        self.assertEqual(by_action["auth.login_failed"]["actor"], "admin")
        self.assertTrue(by_action["auth.login_failed"]["client"])
        self.assertEqual(by_action["control.assess"]["client"], "")
        for row in rows:
            self.assertNotIn("wrong-password-123", str(row))
            self.assertNotIn(TEST_PASSWORD, str(row))

    def test_activity_log_paging_filter_and_access(self):
        for index in range(3):
            self.client.post("/systems", json={"name": f"System {index}", "owner": "IT", "environment": "Test"})
        first = self.activity(limit=2)
        self.assertEqual(len(first), 2)
        rest = self.activity(before=first[-1]["id"])
        self.assertTrue(all(row["id"] < first[-1]["id"] for row in rest))
        self.assertEqual({row["action"].split(".")[0] for row in self.activity(category="auth")}, {"auth"})
        self.assertEqual(self.client.get("/activity", params={"category": "Bad!"}).status_code, 422)
        analyst = self.as_user("analyst5", "analyst")
        self.assertEqual(self.client.get("/activity", headers=analyst).status_code, 403)

    def test_failed_actions_are_not_logged_as_done(self):
        viewer = self.as_user("viewer3", "viewer")
        before = len(self.activity(limit=200))
        self.client.delete(self.system_url, headers=viewer)  # forbidden
        self.client.put(self.control_url, json={"status": "Bogus"})  # invalid
        self.assertEqual(len(self.activity(limit=200)), before)
        self.assertEqual(self.client.get(self.system_url).status_code, 200)

    def test_password_change_is_throttled(self):
        for _ in range(auth.LoginThrottle.MAX_PER_ACCOUNT):
            self.client.post("/auth/password", json={"currentPassword": "not-it-at-all", "newPassword": "new-password-456"})
        blocked = self.client.post("/auth/password", json={"currentPassword": TEST_PASSWORD, "newPassword": "new-password-456"})
        self.assertEqual(blocked.status_code, 429)


if __name__ == "__main__":
    unittest.main()
