"""Offline tests for the AI accuracy harness. No API calls are made."""
import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import evaluate_ai
from app import ai_assessment
from app.config import settings


class ScoreTests(unittest.TestCase):
    def test_accuracy_precision_recall_and_confusion(self):
        rows = [
            {"expected": "Met", "predicted": "Met"},
            {"expected": "Met", "predicted": "Partially Met"},
            {"expected": "Partially Met", "predicted": "Met"},
            {"expected": "Not Met", "predicted": "Not Met"},
            {"expected": "Not Met", "predicted": None},
        ]
        metrics = evaluate_ai.score(rows)
        self.assertEqual((metrics["correct"], metrics["total"]), (2, 5))
        self.assertEqual(metrics["accuracy"], 0.4)
        self.assertEqual(metrics["errors"], 1)
        self.assertEqual(metrics["falseMet"], 1)
        self.assertEqual(metrics["perStatus"]["Met"], {"precision": 0.5, "recall": 0.5, "support": 2})
        self.assertEqual(metrics["perStatus"]["Not Met"], {"precision": 1.0, "recall": 0.5, "support": 2})
        self.assertEqual(metrics["perStatus"]["Partially Met"], {"precision": 0.0, "recall": 0.0, "support": 1})
        self.assertEqual(metrics["confusion"]["Not Met"], {"Not Met": 1, "Error": 1})
        report = evaluate_ai.format_report(metrics)
        self.assertIn("Accuracy: 2/5 = 40%", report)
        self.assertIn("Gaps wrongly called Met: 1", report)

    def test_empty_run(self):
        self.assertIsNone(evaluate_ai.score([])["accuracy"])


class BenchmarkTests(unittest.TestCase):
    def test_shipped_benchmark_is_valid_and_balanced(self):
        data = evaluate_ai.load_benchmark()
        self.assertGreaterEqual(len(data["cases"]), 20)
        for status in evaluate_ai.STATUSES:
            self.assertGreaterEqual(sum(case["expected"] == status for case in data["cases"]), 5, status)

    def test_problems_are_reported(self):
        bad = {"controls": {"AC-2": {}}, "cases": [
            {"id": "a", "control": "XX-1", "expected": "Met", "evidence": "x"},
            {"id": "a", "control": "AC-2", "expected": "Maybe", "evidence": " "},
        ]}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "bench.json"
            path.write_text(json.dumps(bad), encoding="utf-8")
            with self.assertRaises(ValueError) as caught:
                evaluate_ai.load_benchmark(path)
        message = str(caught.exception)
        for expected in ("duplicate id a", "unknown control XX-1", "unknown expected status Maybe", "empty evidence"):
            self.assertIn(expected, message)


class LiveRunTests(unittest.TestCase):
    """main() with the OpenAI call replaced by a fake."""

    def run_main(self, fake, *args):
        out, err = io.StringIO(), io.StringIO()
        with patch.object(settings, "openai_api_key", "offline-test-key"), \
                patch.object(ai_assessment, "analyze_control_evidence", side_effect=fake), \
                redirect_stdout(out), redirect_stderr(err):
            code = evaluate_ai.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_reports_results_and_writes_json(self):
        seen = []

        def always_met(control, evidence):
            seen.append((control.code, evidence[0].extraction_method))
            return SimpleNamespace(suggestedStatus="Met", model_dump=lambda: {}), ["x"]

        with tempfile.TemporaryDirectory() as folder:
            out_path = Path(folder) / "results.json"
            code, out, _ = self.run_main(always_met, "--only", "ac2-complete-policy", "cp9-none",
                                         "ra5-ocr-noise", "--out", str(out_path))
            saved = json.loads(out_path.read_text(encoding="utf-8"))

        self.assertEqual(code, 0)
        self.assertIn("Accuracy: 2/3 = 67%", out)
        self.assertIn("MISS cp9-none", out)
        self.assertEqual(saved["metrics"]["falseMet"], 1)
        self.assertEqual(len(saved["results"]), 3)
        self.assertIn(("RA-5", "ocr"), seen)  # OCR cases are flagged to the AI

    def test_stops_on_quota_errors(self):
        def quota(control, evidence):
            raise ai_assessment.AIServiceError("OpenAI quota or rate limit reached.", 429)

        code, out, err = self.run_main(quota, "--repeat", "2")
        self.assertEqual(code, 2)
        self.assertIn("Stopping", err)
        self.assertIn("Failed requests: 1", out)


if __name__ == "__main__":
    unittest.main()
