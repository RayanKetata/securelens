/* Run with: node --test src/utils/ (no npm or extra packages needed). */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRiskSummary } from "./riskSummary.js";

function control(code, status, extra = {}) {
  return {
    code,
    name: `${code} control`,
    family: "Access Control",
    status,
    findings: "",
    evidence: [],
    ...extra,
  };
}

const withEvidence = { evidence: [{ id: 1, name: "policy.pdf" }] };

test("no controls", () => {
  const summary = buildRiskSummary({ controls: [] });

  assert.equal(summary.rating, "Not Assessed");
  assert.match(summary.headline, /No controls are assigned/);
  assert.deepEqual(summary.nextSteps, [
    "Add the security controls that apply to this system.",
  ]);
});

test("nothing assessed yet", () => {
  const summary = buildRiskSummary({
    controls: [control("AC-1", "Not Assessed"), control("AC-2", "Not Assessed")],
  });

  assert.equal(summary.rating, "Not Assessed");
  assert.match(summary.headline, /None of the 2 controls/);
  assert.equal(summary.coverage, 0);
  assert.match(summary.nextSteps.at(-1), /Assess the remaining 2 controls \(AC-1, AC-2\)/);

  const single = buildRiskSummary({ controls: [control("AC-1", "Not Assessed")] });
  assert.equal(single.headline, "The system's only control has not been assessed yet, so the risk level is not known.");
});

test("high risk lists failing controls, findings, and the weakest family", () => {
  const summary = buildRiskSummary({
    controls: [
      control("AC-2", "Not Met", { findings: "No quarterly access review." }),
      control("IA-5", "Partially Met", { family: "Identification", ...withEvidence }),
      control("AU-2", "Met", { family: "Audit", ...withEvidence }),
      control("AU-6", "Not Assessed", { family: "Audit" }),
    ],
  });

  assert.equal(summary.rating, "High");
  assert.equal(summary.headline, "High risk: 1 of 4 controls is not met (AC-2).");
  assert.equal(summary.coverage, 75);
  assert.equal(summary.priorities[0].code, "AC-2");
  assert.equal(summary.priorities[0].finding, "No quarterly access review.");
  assert.equal(summary.priorities[1].finding, "No findings recorded.");
  assert.ok(summary.points.includes("Weakest area: Access Control (1 not met of 1)."));
  assert.ok(summary.nextSteps[0].startsWith("Remediate AC-2"));
  assert.ok(summary.nextSteps.some((step) => step.includes("Write findings for IA-5")));
});

test("medium risk and evidence gaps", () => {
  const summary = buildRiskSummary({
    controls: [
      control("AC-2", "Partially Met", { findings: "Reviews are informal." }),
      control("AC-3", "Met"),
    ],
  });

  assert.equal(summary.rating, "Medium");
  assert.match(summary.headline, /1 control is only partially met \(AC-2\)/);
  assert.ok(summary.points.some((point) => point.includes("without any evidence file (AC-2, AC-3)")));
  assert.ok(summary.nextSteps.includes("Attach supporting evidence for AC-2, AC-3."));
});

test("low risk warns when coverage is incomplete", () => {
  const summary = buildRiskSummary({
    controls: [control("AC-2", "Met", withEvidence), control("AC-3", "Not Assessed")],
  });

  assert.equal(summary.rating, "Low");
  assert.equal(summary.headline, "Low risk: the one assessed control is met.");
  assert.match(summary.caveats[0], /could still change it/);
});

test("fully met system suggests upkeep only", () => {
  const summary = buildRiskSummary({
    controls: [control("AC-2", "Met", withEvidence), control("AC-3", "Met", withEvidence)],
  });

  assert.equal(summary.rating, "Low");
  assert.equal(summary.headline, "Low risk: all 2 assessed controls are met.");
  assert.equal(summary.points.length, 1);
  assert.deepEqual(summary.nextSteps, [
    "Keep evidence current and reassess controls when the system changes.",
  ]);
});

test("long lists and findings are shortened", () => {
  const controls = Array.from({ length: 8 }, (_, index) =>
    control(`AC-${index + 1}`, "Not Met", { findings: "x".repeat(400) })
  );
  const summary = buildRiskSummary({ controls });

  assert.match(summary.headline, /AC-1, AC-2, AC-3, AC-4, AC-5 and 3 more/);
  assert.ok(summary.priorities[0].finding.length <= 160);
  assert.ok(summary.nextSteps.includes("Remediate the other 3 controls that are not met."));
});
