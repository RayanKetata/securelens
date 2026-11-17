"""Measure how often AI review agrees with hand-labeled answers.

Runs the real AI review on a fictional benchmark
(tests/fixtures/ai_benchmark.json) and reports accuracy, per-status
precision and recall, a confusion matrix, and every disagreement.

    python evaluate_ai.py --dry-run           # check the benchmark, no API calls
    python evaluate_ai.py                     # one live run (billable)
    python evaluate_ai.py --repeat 3 --out results.json

A live run makes one billable OpenAI request per case per repeat and
needs OPENAI_API_KEY in backend/.env.
"""
import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

STATUSES = ["Met", "Partially Met", "Not Met"]
BENCHMARK = Path(__file__).parent / "tests" / "fixtures" / "ai_benchmark.json"


def load_benchmark(path=BENCHMARK):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    problems = []
    seen = set()

    for case in data["cases"]:
        if case["id"] in seen:
            problems.append(f"duplicate id {case['id']}")
        seen.add(case["id"])
        if case["control"] not in data["controls"]:
            problems.append(f"{case['id']}: unknown control {case['control']}")
        if case["expected"] not in STATUSES:
            problems.append(f"{case['id']}: unknown expected status {case['expected']}")
        if not case["evidence"].strip():
            problems.append(f"{case['id']}: empty evidence")

    if problems:
        raise ValueError("Benchmark problems: " + "; ".join(problems))

    return data


def score(results):
    """Metrics from a list of {"expected", "predicted"} dicts.

    predicted may be None when the request failed; such cases count as
    wrong and are reported separately as errors.
    """
    total = len(results)
    correct = sum(1 for row in results if row["predicted"] == row["expected"])
    errors = sum(1 for row in results if row["predicted"] is None)
    matrix = {expected: Counter() for expected in STATUSES}

    for row in results:
        matrix[row["expected"]][row["predicted"] or "Error"] += 1

    per_status = {}
    for status in STATUSES:
        true_positive = matrix[status][status]
        predicted = sum(matrix[expected][status] for expected in STATUSES)
        actual = sum(matrix[status].values())
        per_status[status] = {
            "precision": round(true_positive / predicted, 3) if predicted else None,
            "recall": round(true_positive / actual, 3) if actual else None,
            "support": actual,
        }

    # The costliest mistake for an assessor: calling a gap "Met".
    overcalls = sum(
        1 for row in results
        if row["predicted"] == "Met" and row["expected"] != "Met"
    )

    return {
        "total": total,
        "correct": correct,
        "accuracy": round(correct / total, 3) if total else None,
        "errors": errors,
        "falseMet": overcalls,
        "perStatus": per_status,
        "confusion": {expected: dict(counts) for expected, counts in matrix.items()},
    }


def format_report(metrics):
    lines = [
        f"Accuracy: {metrics['correct']}/{metrics['total']} = {metrics['accuracy']:.0%}"
        if metrics["total"] else "No cases run.",
        f"Gaps wrongly called Met: {metrics['falseMet']}",
        f"Failed requests: {metrics['errors']}",
        "",
        f"{'Status':<15}{'Precision':>10}{'Recall':>8}{'Cases':>7}",
    ]
    for status, values in metrics["perStatus"].items():
        precision = "-" if values["precision"] is None else f"{values['precision']:.0%}"
        recall = "-" if values["recall"] is None else f"{values['recall']:.0%}"
        lines.append(f"{status:<15}{precision:>10}{recall:>8}{values['support']:>7}")

    columns = STATUSES + ["Error"]
    lines += ["", "Confusion (rows: expected, columns: AI)",
              f"{'':<15}" + "".join(f"{name:>15}" for name in columns)]
    for expected, counts in metrics["confusion"].items():
        lines.append(f"{expected:<15}" + "".join(f"{counts.get(name, 0):>15}" for name in columns))

    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repeat", type=int, default=1, choices=range(1, 11),
                        help="run every case this many times (checks consistency)")
    parser.add_argument("--only", nargs="+", metavar="CASE_ID", help="run only these cases")
    parser.add_argument("--out", type=Path, help="write the full results as JSON")
    parser.add_argument("--dry-run", action="store_true", help="validate the benchmark without calling the API")
    args = parser.parse_args(argv)

    data = load_benchmark()
    cases = [case for case in data["cases"] if not args.only or case["id"] in args.only]
    counts = Counter(case["expected"] for case in cases)
    print(f"{len(cases)} cases over {len({case['control'] for case in cases})} controls: "
          + ", ".join(f"{counts[status]} {status}" for status in STATUSES), flush=True)

    if args.dry_run:
        print("Benchmark is valid. No requests were made.")
        return 0

    from app.ai_assessment import AIServiceError, analyze_control_evidence
    from app.config import settings

    if not settings.openai_api_key:
        print("OPENAI_API_KEY is not set in backend/.env.", file=sys.stderr)
        return 2

    print(f"Model: {settings.openai_model}; {len(cases) * args.repeat} live requests", flush=True)
    results = []

    for repeat in range(args.repeat):
        for case in cases:
            control = SimpleNamespace(**data["controls"][case["control"]])
            evidence = SimpleNamespace(
                original_filename=case["id"] + ".txt",
                extracted_text=case["evidence"],
                extraction_method="ocr" if case.get("ocr") else "text",
            )
            row = {"case": case["id"], "run": repeat + 1, "control": case["control"],
                   "expected": case["expected"], "predicted": None}
            try:
                result, _ = analyze_control_evidence(control, [evidence])
                row.update(predicted=result.suggestedStatus, detail=result.model_dump())
            except AIServiceError as error:
                row["error"] = str(error)
                if error.status_code in (401, 429, 503):
                    # Key, quota, or availability problem: later cases would fail too.
                    print(f"Stopping: {error}", file=sys.stderr, flush=True)
                    results.append(row)
                    break
            results.append(row)
            mark = "ok  " if row["predicted"] == row["expected"] else "MISS"
            print(f"{mark} {case['id']:<32} expected {case['expected']:<14} AI {row['predicted']}", flush=True)
        else:
            continue
        break

    metrics = score(results)
    print("\n" + format_report(metrics))

    if args.out:
        args.out.write_text(json.dumps({
            "ranAt": datetime.now(timezone.utc).isoformat(),
            "model": settings.openai_model,
            "benchmarkVersion": data["version"],
            "metrics": metrics,
            "results": results,
        }, indent=2), encoding="utf-8")
        print(f"\nSaved {args.out}")

    return 0 if metrics["errors"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
