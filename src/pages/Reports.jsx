import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useSystems } from "../context/systems-context";
import InfoTooltip from "../components/InfoTooltip";
import {exportSystemReport} from "../utils/exportReportPdf";

function Reports() {
  const navigate = useNavigate();

  const { systems } = useSystems();

  const reports = useMemo(() => {
    return systems.map((system) => {
      const totalControls = system.controls.length;

      const met = system.controls.filter(
        (control) => control.status === "Met"
      ).length;

      const partiallyMet = system.controls.filter(
        (control) => control.status === "Partially Met"
      ).length;

      const notMet = system.controls.filter(
        (control) => control.status === "Not Met"
      ).length;

      const notAssessed = system.controls.filter(
        (control) => control.status === "Not Assessed"
      ).length;

      return {
        ...system,
        totalControls,
        met,
        partiallyMet,
        notMet,
        notAssessed,
      };
    });
  }, [systems]);

  const completedReports = reports.filter(
    (report) => report.status === "Completed"
  ).length;

  const inProgressReports = reports.filter(
    (report) => report.status === "In Progress"
  ).length;

  const totalFindings = reports.reduce(
    (total, report) =>
      total +
      report.controls.filter(
        (control) =>
          control.findings &&
          control.findings.trim() !== ""
      ).length,
    0
  );

  return (
    <div className="reports-page">
      <div className="page-header">
        <div>
          <h1>
            Reports
            <InfoTooltip
              text="Reports summarize security assessment results, evidence, findings, risk, and control status for each system."
            />
          </h1>

          <p>
            Review security assessment reports across all systems.
          </p>
        </div>
      </div>

      <div className="reports-summary-grid">
        <div className="summary-box">
          <span>Total Reports</span>
          <strong>{reports.length}</strong>
        </div>

        <div className="summary-box">
          <span>Completed</span>
          <strong className="green">
            {completedReports}
          </strong>
        </div>

        <div className="summary-box">
          <span>In Progress</span>
          <strong>{inProgressReports}</strong>
        </div>

        <div className="summary-box">
          <span>Total Findings</span>
          <strong className="orange">
            {totalFindings}
          </strong>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="panel reports-empty">
          <h3>No reports available</h3>

          <p>
            Create systems and security assessments before generating reports.
          </p>

          <button
            className="primary-button"
            onClick={() => navigate("/systems")}
          >
            Go to Systems
          </button>
        </div>
      ) : (
        <div className="reports-grid">
          {reports.map((report) => (
            <div
              className="report-card"
              key={report.id}
            >
              <div className="report-card-header">
                <div>
                  <h3>{report.name}</h3>

                  <p>
                    {report.owner} • {report.environment}
                  </p>
                </div>

                <span
                  className={`risk-badge ${report.risk
                    .toLowerCase()
                    .replaceAll(" ", "-")}`}
                >
                  {report.risk}
                </span>
              </div>

              <div className="report-progress-section">
                <div className="report-progress-header">
                  <span>Assessment Progress</span>
                  <strong>{report.progress}%</strong>
                </div>

                <div className="report-progress-bar">
                  <div
                    className="report-progress-fill"
                    style={{
                      width: `${report.progress}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div className="report-status-grid">
                <div>
                  <span>Met</span>
                  <strong className="green">
                    {report.met}
                  </strong>
                </div>

                <div>
                  <span>Partial</span>
                  <strong className="orange">
                    {report.partiallyMet}
                  </strong>
                </div>

                <div>
                  <span>Not Met</span>
                  <strong className="red">
                    {report.notMet}
                  </strong>
                </div>

                <div>
                  <span>Pending</span>
                  <strong>
                    {report.notAssessed}
                  </strong>
                </div>
              </div>

              <div className="report-card-meta">
                <div>
                  <span>Total Controls</span>
                  <strong>
                    {report.totalControls}
                  </strong>
                </div>

                <div>
                  <span>Evidence Files</span>
                  <strong>
                    {report.evidenceCount || 0}
                  </strong>
                </div>
              </div>

              <div className="report-card-actions">
                <button
                  className="secondary-button"
                  onClick={() =>
                    navigate(`/reports/${report.id}`)
                  }
                >
                  View Report
                </button>

                <button
                  className="primary-button"
                  onClick={() =>
                    exportSystemReport(report)
                  }
                >
                  Export PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Reports;