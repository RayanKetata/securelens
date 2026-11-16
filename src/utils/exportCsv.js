/*
 * CSV export of assessment results.
 *
 * Values are quoted per RFC 4180. Cells that start with a
 * spreadsheet formula character are prefixed with an
 * apostrophe so analyst-entered text cannot run as a
 * formula when the file is opened in Excel or Sheets.
 */

const COLUMNS = [
  ["System", (system) => system.name],
  ["Owner", (system) => system.owner],
  ["Environment", (system) => system.environment],
  ["System Status", (system) => system.status],
  ["Risk", (system) => system.risk],
  ["Progress (%)", (system) => system.progress],
  ["Control", (system, control) => control?.code],
  ["Control Name", (system, control) => control?.name],
  ["Family", (system, control) => control?.family],
  ["Assessment Status", (system, control) => control?.status],
  ["Evidence Files", (system, control) => control ? control.evidence?.length || 0 : ""],
  ["Analyst Notes", (system, control) => control?.analystNotes],
  ["Findings", (system, control) => control?.findings],
];

export function toCsvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export function buildAssessmentCsv(systems) {
  const lines = [COLUMNS.map(([header]) => toCsvCell(header)).join(",")];

  for (const system of systems) {
    // A system without controls still gets one row.
    const controls = system.controls?.length ? system.controls : [null];

    for (const control of controls) {
      lines.push(
        COLUMNS.map(([, read]) => toCsvCell(read(system, control))).join(",")
      );
    }
  }

  return lines.join("\r\n") + "\r\n";
}

function safeFilePart(value) {
  return String(value)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "export";
}

export function downloadAssessmentCsv(systems, name = "all-systems") {
  // The BOM makes Excel read the file as UTF-8.
  const blob = new Blob(["﻿" + buildAssessmentCsv(systems)], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `securelens-${safeFilePart(name)}-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}
