import { useNavigate, useParams } from "react-router";
import { exportSystemReport } from "../utils/exportReportPdf";
import { useSystems } from "../context/systems-context";
import InfoTooltip from "../components/InfoTooltip";

function ReportDetails() {
  const { id } = useParams();

  const navigate = useNavigate();

  const { systems } = useSystems();

  const system = systems.find(
    (currentSystem) =>
      currentSystem.id.toString() === id
  );

  if (!system) {
    return (
      <div>
        <h1>Report Not Found</h1>

        <p>
          The requested system report could not be found.
        </p>

        <button
          className="primary-button"
          onClick={() => navigate("/reports")}
        >
          Back to Reports
        </button>
      </div>
    );
  }

  const metCount = system.controls.filter(
    (control) => control.status === "Met"
  ).length;

  const partiallyMetCount = system.controls.filter(
    (control) =>
      control.status === "Partially Met"
  ).length;

  const notMetCount = system.controls.filter(
    (control) => control.status === "Not Met"
  ).length;

  const notAssessedCount = system.controls.filter(
    (control) =>
      control.status === "Not Assessed"
  ).length;

  return (
    <div className="report-details-page">
      <button
        className="back-button"
        onClick={() => navigate("/reports")}
      >
        ← Back to Reports
      </button>

      <div className="report-details-header">
        <div>
          <span className="report-label">
            Security Assessment Report
          </span>

          <h1>{system.name}</h1>

          <p>
            Security assessment summary and control findings.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={() => 
            exportSystemReport(system)
            }
         >
          Export PDF
        </button>
      </div>

      <div className="report-system-info">
        <div>
          <span>Business Owner</span>
          <strong>{system.owner}</strong>
        </div>

        <div>
          <span>Environment</span>
          <strong>{system.environment}</strong>
        </div>

        <div>
          <span>Status</span>
          <strong>{system.status}</strong>
        </div>

        <div>
          <span>Risk Level</span>
          <strong>{system.risk}</strong>
        </div>
      </div>

      <div className="report-overview-grid">
        <div className="panel report-overview-panel">
          <div className="panel-header">
            <h3>
              Assessment Summary
              <InfoTooltip
                text="This section summarizes the current assessment results for all controls assigned to this system."
              />
            </h3>
          </div>

          <div className="report-score-section">
            <div className="report-score-circle">
              <span>{system.progress}%</span>
            </div>

            <div className="report-result-list">
              <div>
                <span className="report-dot met"></span>
                <span>Met</span>
                <strong>{metCount}</strong>
              </div>

              <div>
                <span className="report-dot partial"></span>
                <span>Partially Met</span>
                <strong>
                  {partiallyMetCount}
                </strong>
              </div>

              <div>
                <span className="report-dot not-met"></span>
                <span>Not Met</span>
                <strong>{notMetCount}</strong>
              </div>

              <div>
                <span className="report-dot pending"></span>
                <span>Not Assessed</span>
                <strong>
                  {notAssessedCount}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="panel report-evidence-summary">
          <div className="panel-header">
            <h3>
              Evidence Summary
              <InfoTooltip
                text="Shows the number of evidence files linked to security controls in this system."
              />
            </h3>
          </div>

          <div className="report-evidence-number">
            {system.evidenceCount || 0}
          </div>

          <p>
            Evidence files linked to this assessment.
          </p>
        </div>
      </div>

      <div className="panel report-controls-panel">
        <div className="report-section-heading">
          <div>
            <h3>Control Assessment Details</h3>

            <p>
              Detailed status, notes, findings, and evidence
              for each security control.
            </p>
          </div>
        </div>

        {system.controls.length === 0 ? (
          <div className="reports-empty">
            <h3>No controls assigned</h3>

            <p>
              This system has no security controls yet.
            </p>
          </div>
        ) : (
          <div className="report-controls-list">
            {system.controls.map((control) => (
              <div
                className="report-control-item"
                key={control.code}
              >
                <div className="report-control-header">
                  <div>
                    <span className="catalog-control-code">
                      {control.code}
                    </span>

                    <h3>{control.name}</h3>
                  </div>

                  <span
                    className={`control-status ${control.status
                      .toLowerCase()
                      .replaceAll(" ", "-")}`}
                  >
                    {control.status}
                  </span>
                </div>

                <div className="report-control-content">
                  <div className="report-control-section">
                    <span>Analyst Notes</span>

                    <p>
                      {control.analystNotes?.trim()
                        ? control.analystNotes
                        : "No analyst notes recorded."}
                    </p>
                  </div>

                  <div className="report-control-section">
                    <span>Findings</span>

                    <p>
                      {control.findings?.trim()
                        ? control.findings
                        : "No findings recorded."}
                    </p>
                  </div>

                  <div className="report-control-section">
                    <span>Evidence</span>

                    {(control.evidence || []).length === 0 ? (
                      <p>
                        No evidence linked to this control.
                      </p>
                    ) : (
                      <div className="report-evidence-list">
                        {(control.evidence || []).map(
                          (evidence) => (
                            <div
                              key={evidence.id}
                              className="report-evidence-item"
                            >
                              📄 {evidence.name}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="report-control-footer">
                  <button
                    className="view-button"
                    onClick={() =>
                      navigate(
                        `/systems/${system.id}/controls/${control.code}`
                      )
                    }
                  >
                    Open Assessment
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportDetails;