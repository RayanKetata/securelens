import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import RiskSummary from "./RiskSummary";

const SYSTEM = {
  id: 7,
  name: "Payroll Processing Service",
  controls: [
    { code: "AC-2", name: "Account Management", family: "Access Control", status: "Met", findings: "", evidence: [{ id: 1 }] },
    { code: "RA-5", name: "Vulnerability Monitoring and Scanning", family: "Risk Assessment", status: "Not Met",
      findings: "Unauthenticated scans only.", evidence: [] },
    { code: "SI-2", name: "Flaw Remediation", family: "System and Information Integrity", status: "Partially Met",
      findings: "", evidence: [] },
  ],
};

function renderSummary(system = SYSTEM) {
  render(
    <MemoryRouter initialEntries={["/reports/7"]}>
      <Routes>
        <Route path="/reports/7" element={<RiskSummary system={system} />} />
        <Route path="/systems/:id/controls/:code" element={<p>Control page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RiskSummary", () => {
  it("rates a system with an unmet control as high risk and lists the gap", () => {
    renderSummary();
    expect(screen.getByText(/High risk/)).toBeInTheDocument();
    const table = screen.getAllByRole("table")[0]; // Priority Gaps
    expect(within(table).getByText("Unauthenticated scans only.")).toBeInTheDocument();
    expect(within(table).getByText(/Flaw Remediation/)).toBeInTheDocument();
  });

  it("links a priority gap to its control page", async () => {
    const user = userEvent.setup();
    renderSummary();
    await user.click(screen.getByRole("button", { name: "RA-5" }));
    expect(await screen.findByText("Control page")).toBeInTheDocument();
  });

  it("says when nothing has been assessed yet", () => {
    renderSummary({ ...SYSTEM, controls: SYSTEM.controls.map((control) => ({ ...control, status: "Not Assessed" })) });
    expect(screen.queryByRole("heading", { name: "Priority Gaps" })).not.toBeInTheDocument();
    expect(screen.queryByText(/High risk/)).not.toBeInTheDocument();
  });
});
