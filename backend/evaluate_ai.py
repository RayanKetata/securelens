"""Opt-in live evaluation using fictional evidence. Makes billable OpenAI requests."""
import argparse
import json
from pathlib import Path
from types import SimpleNamespace

from app.ai_assessment import analyze_control_evidence, AIServiceError
from app.config import settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeat", type=int, default=1, choices=range(1, 11))
    args = parser.parse_args()
    cases = json.loads((Path(__file__).parent / "tests/fixtures/ai_cases.json").read_text(encoding="utf-8"))
    passed = 0
    total = len(cases["cases"]) * args.repeat
    print(f"Model: {settings.openai_model}; {total} live assessments", flush=True)
    for repeat in range(args.repeat):
        for case in cases["cases"]:
            try:
                result, _ = analyze_control_evidence(
                    SimpleNamespace(**cases["control"]),
                    [SimpleNamespace(original_filename=case["id"] + ".txt", extracted_text=case["evidence"])],
                )
            except (AIServiceError, ValueError) as error:
                print(f"ERROR {case['id']}: {error}", flush=True)
                return 2
            matched = result.suggestedStatus == case["expected"]
            passed += int(matched)
            print(json.dumps({"case": case["id"], "run": repeat + 1, "passed": matched,
                              "expected": case["expected"], **result.model_dump()}), flush=True)
    print(f"Passed: {passed}/{total}", flush=True)
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
