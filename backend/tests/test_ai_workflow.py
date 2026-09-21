"""Offline regression tests. Isolated SQLite database; never uses real credentials."""
import os
import io
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
from app import ai_assessment, main, schemas
from app.database import Base, engine


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


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        self.uploads = tempfile.TemporaryDirectory(dir=_workspace.name)
        self.storage = patch.object(main, "UPLOAD_DIR", Path(self.uploads.name))
        self.storage.start()
        self.client = TestClient(main.app)
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
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
        writer = PdfWriter()
        page = writer.add_blank_page(width=300, height=300)
        font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
        page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
        stream = DecodedStreamObject()
        stream.set_data(b"BT /F1 12 Tf 20 250 Td (Manager approval is required.) Tj ET")
        page[NameObject("/Contents")] = stream
        buffer = io.BytesIO()
        writer.write(buffer)
        response = self.upload(buffer.getvalue(), "policy.pdf", "application/pdf")
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["extractionStatus"], "completed")
        text = self.client.get(f"/evidence/{response.json()['id']}/text").json()["extractedText"]
        self.assertIn("Manager approval is required.", text)

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


if __name__ == "__main__":
    unittest.main()
