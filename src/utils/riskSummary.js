/*
 * Builds a plain-language risk summary from saved assessment data.
 *
 * Deterministic: the same controls always give the same summary, no AI
 * call is made, and every statement traces back to a saved status,
 * finding, or evidence count. The rating follows the same rule as the
 * backend (any Not Met → High, any Partially Met → Medium, otherwise
 * Low once something is assessed).
 */

const MAX_LISTED = 5;
const FINDING_PREVIEW = 160;

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function listCodes(controls) {
  const codes = controls.slice(0, MAX_LISTED).map((control) => control.code);
  const extra = controls.length - codes.length;

  return extra > 0 ? `${codes.join(", ")} and ${extra} more` : codes.join(", ");
}

function preview(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();

  if (clean.length <= FINDING_PREVIEW) return clean;

  return `${clean.slice(0, FINDING_PREVIEW - 1).trimEnd()}…`;
}

function ratingFor(counts) {
  if (counts.notMet > 0) return "High";
  if (counts.partial > 0) return "Medium";
  if (counts.total - counts.notAssessed > 0) return "Low";
  return "Not Assessed";
}

function summarizeFamilies(controls) {
  const families = new Map();

  for (const control of controls) {
    const name = control.family?.trim() || "Other";
    const entry = families.get(name) || {
      family: name,
      total: 0,
      met: 0,
      partial: 0,
      notMet: 0,
      notAssessed: 0,
    };

    entry.total += 1;
    if (control.status === "Met") entry.met += 1;
    else if (control.status === "Partially Met") entry.partial += 1;
    else if (control.status === "Not Met") entry.notMet += 1;
    else entry.notAssessed += 1;

    families.set(name, entry);
  }

  // Weakest first: most Not Met, then most Partially Met, then name.
  return [...families.values()].sort(
    (a, b) =>
      b.notMet - a.notMet ||
      b.partial - a.partial ||
      a.family.localeCompare(b.family)
  );
}

export function buildRiskSummary(system) {
  const controls = system?.controls || [];

  const byStatus = (status) =>
    controls.filter((control) => control.status === status);

  const notMet = byStatus("Not Met");
  const partial = byStatus("Partially Met");
  const met = byStatus("Met");
  const notAssessed = controls.filter(
    (control) =>
      !["Met", "Partially Met", "Not Met"].includes(control.status)
  );

  const counts = {
    total: controls.length,
    met: met.length,
    partial: partial.length,
    notMet: notMet.length,
    notAssessed: notAssessed.length,
  };

  const assessed = counts.total - counts.notAssessed;
  const coverage = counts.total
    ? Math.round((assessed / counts.total) * 100)
    : 0;

  const rating = ratingFor(counts);
  const families = summarizeFamilies(controls);

  const hasFindings = (control) => Boolean(control.findings?.trim());
  const evidenceCount = (control) => (control.evidence || []).length;

  // Controls whose positive or partial rating has no supporting file.
  // Both lists keep the system's control order.
  const unsupported = controls.filter(
    (control) =>
      ["Met", "Partially Met"].includes(control.status) &&
      evidenceCount(control) === 0
  );

  // Gaps that were rated but not described.
  const undocumented = controls.filter(
    (control) =>
      ["Not Met", "Partially Met"].includes(control.status) &&
      !hasFindings(control)
  );

  const priorities = [...notMet, ...partial].map((control) => ({
    code: control.code,
    name: control.name,
    family: control.family || "Other",
    status: control.status,
    finding: hasFindings(control)
      ? preview(control.findings)
      : "No findings recorded.",
    evidenceCount: evidenceCount(control),
  }));

  // ---------------- headline ----------------
  let headline;

  if (counts.total === 0) {
    headline =
      "No controls are assigned to this system, so its risk cannot be assessed yet.";
  } else if (assessed === 0) {
    headline =
      counts.total === 1
        ? "The system's only control has not been assessed yet, so the risk level is not known."
        : `None of the ${counts.total} controls have been assessed yet, so the risk level is not known.`;
  } else if (rating === "High") {
    headline = `High risk: ${counts.notMet} of ${plural(counts.total, "control")} ${counts.notMet === 1 ? "is" : "are"} not met (${listCodes(notMet)}).`;
  } else if (rating === "Medium") {
    headline = `Medium risk: no control is failing outright, but ${plural(counts.partial, "control is", "controls are")} only partially met (${listCodes(partial)}).`;
  } else {
    headline =
      assessed === 1
        ? "Low risk: the one assessed control is met."
        : `Low risk: all ${assessed} assessed controls are met.`;
  }

  // ---------------- key points ----------------
  const points = [];

  if (counts.total > 0) {
    points.push(
      `Assessment coverage is ${coverage}%: ${assessed} of ${plural(counts.total, "control")} assessed` +
        (counts.notAssessed
          ? `, ${counts.notAssessed} still pending.`
          : ".")
    );
  }

  const weakest = families.find(
    (family) => family.notMet > 0 || family.partial > 0
  );

  if (weakest) {
    const parts = [];
    if (weakest.notMet) parts.push(`${weakest.notMet} not met`);
    if (weakest.partial) parts.push(`${weakest.partial} partially met`);

    points.push(
      `Weakest area: ${weakest.family} (${parts.join(", ")} of ${weakest.total}).`
    );
  }

  if (unsupported.length) {
    points.push(
      `${plural(unsupported.length, "control is", "controls are")} rated Met or Partially Met without any evidence file (${listCodes(unsupported)}).`
    );
  }

  if (undocumented.length) {
    points.push(
      `${plural(undocumented.length, "gap has", "gaps have")} no written findings (${listCodes(undocumented)}).`
    );
  }

  // ---------------- caveats ----------------
  const caveats = [];

  if (rating === "Low" && counts.notAssessed > 0) {
    caveats.push(
      `The Low rating covers assessed controls only; ${plural(counts.notAssessed, "control")} could still change it.`
    );
  }

  caveats.push(
    "Ratings reflect analyst-saved decisions. The control catalog uses short summaries, not the complete framework requirements."
  );

  // ---------------- next steps ----------------
  const nextSteps = [];

  for (const control of notMet.slice(0, MAX_LISTED)) {
    nextSteps.push(
      hasFindings(control)
        ? `Remediate ${control.code} ${control.name}: ${preview(control.findings)}`
        : `Remediate ${control.code} ${control.name} and record findings describing the gap.`
    );
  }

  if (notMet.length > MAX_LISTED) {
    nextSteps.push(
      `Remediate the other ${notMet.length - MAX_LISTED} controls that are not met.`
    );
  }

  if (partial.length) {
    nextSteps.push(
      `Close the remaining gaps in ${listCodes(partial)}.`
    );
  }

  if (undocumented.length) {
    nextSteps.push(
      `Write findings for ${listCodes(undocumented)} so each gap is documented.`
    );
  }

  if (unsupported.length) {
    nextSteps.push(
      `Attach supporting evidence for ${listCodes(unsupported)}.`
    );
  }

  if (counts.notAssessed) {
    nextSteps.push(
      `Assess the remaining ${plural(counts.notAssessed, "control")} (${listCodes(notAssessed)}).`
    );
  }

  if (counts.total === 0) {
    nextSteps.push("Add the security controls that apply to this system.");
  } else if (nextSteps.length === 0) {
    nextSteps.push(
      "Keep evidence current and reassess controls when the system changes."
    );
  }

  return {
    rating,
    headline,
    coverage,
    counts,
    points,
    priorities,
    families,
    caveats,
    nextSteps,
  };
}
