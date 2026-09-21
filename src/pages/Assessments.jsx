import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { useSystems } from "../context/systems-context";
import InfoTooltip from "../components/InfoTooltip";

function Assessments() {
  const navigate = useNavigate();

  const { systems } = useSystems();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const assessments = useMemo(() => {
    const rows = [];

    systems.forEach((system) => {
      system.controls.forEach((control) => {
        rows.push({
          systemId: system.id,
          systemName: system.name,
          systemOwner: system.owner,
          environment: system.environment,

          controlCode: control.code,
          controlName: control.name,

          status: control.status,

          evidenceCount:
            control.evidence?.length || 0,

          analystNotes:
            control.analystNotes || "",

          findings:
            control.findings || "",
        });
      });
    });

    return rows;
  }, [systems]);

  const filteredAssessments = assessments.filter(
    (assessment) => {
      const search = searchTerm.toLowerCase();

      const matchesSearch =
        assessment.systemName
          .toLowerCase()
          .includes(search) ||
        assessment.controlCode
          .toLowerCase()
          .includes(search) ||
        assessment.controlName
          .toLowerCase()
          .includes(search) ||
        assessment.systemOwner
          .toLowerCase()
          .includes(search);

      const matchesStatus =
        statusFilter === "All" ||
        assessment.status === statusFilter;

      return matchesSearch && matchesStatus;
    }
  );

  const notAssessedCount = assessments.filter(
    (assessment) =>
      assessment.status === "Not Assessed"
  ).length;

  const metCount = assessments.filter(
    (assessment) =>
      assessment.status === "Met"
  ).length;

  const partiallyMetCount = assessments.filter(
    (assessment) =>
      assessment.status === "Partially Met"
  ).length;

  const notMetCount = assessments.filter(
    (assessment) =>
      assessment.status === "Not Met"
  ).length;

  function getStatusClass(status) {
    return status
      .toLowerCase()
      .replaceAll(" ", "-");
  }

  return (
    <div className="assessments-page">
      <div className="page-header">
        <div>
          <h1>
            Assessments
            <InfoTooltip
              text="This page shows all security-control assessments across every system in SecureLens."
            />
          </h1>

          <p>
            Review assessment progress, evidence, and
            outstanding security controls.
          </p>
        </div>
      </div>

      <div className="assessments-summary-grid">
        <div className="summary-box">
          <span>Total Assessments</span>

          <strong>
            {assessments.length}
          </strong>
        </div>

        <div className="summary-box">
          <span>Not Assessed</span>

          <strong>
            {notAssessedCount}
          </strong>
        </div>

        <div className="summary-box">
          <span>Partially Met</span>

          <strong className="orange">
            {partiallyMetCount}
          </strong>
        </div>

        <div className="summary-box">
          <span>Not Met</span>

          <strong className="red">
            {notMetCount}
          </strong>
        </div>

        <div className="summary-box">
          <span>Met</span>

          <strong className="green">
            {metCount}
          </strong>
        </div>
      </div>

      <div className="panel assessments-panel">
        <div className="assessments-toolbar">
          <div>
            <h3>Assessment Work Queue</h3>

            <p>
              View and manage security-control assessments
              across all systems.
            </p>
          </div>

          <div className="assessments-tools">
            <input
              type="text"
              className="assessment-search"
              placeholder="Search assessments..."
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(
                  event.target.value
                )
              }
            />

            <select
              className="assessment-status-filter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
            >
              <option value="All">
                All Statuses
              </option>

              <option value="Not Assessed">
                Not Assessed
              </option>

              <option value="Met">
                Met
              </option>

              <option value="Partially Met">
                Partially Met
              </option>

              <option value="Not Met">
                Not Met
              </option>
            </select>
          </div>
        </div>

        {assessments.length === 0 ? (
          <div className="assessments-empty">
            <h3>No assessments yet</h3>

            <p>
              Add security controls to a system to begin
              creating assessments.
            </p>

            <button
              className="primary-button"
              onClick={() =>
                navigate("/systems")
              }
            >
              Go to Systems
            </button>
          </div>
        ) : filteredAssessments.length === 0 ? (
          <div className="assessments-empty">
            <h3>No matching assessments</h3>

            <p>
              Try changing your search or status filter.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>System</th>

                  <th>
                    Control
                    <InfoTooltip
                      text="The security control being assessed for this system."
                    />
                  </th>

                  <th>
                    Status
                    <InfoTooltip
                      text="Shows whether the control is Met, Partially Met, Not Met, or has not yet been assessed."
                    />
                  </th>

                  <th>
                    Evidence
                    <InfoTooltip
                      text="The number of evidence files currently linked to this control."
                    />
                  </th>

                  <th>Notes</th>

                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filteredAssessments.map(
                  (assessment) => (
                    <tr
                      key={`${assessment.systemId}-${assessment.controlCode}`}
                    >
                      <td>
                        <button
                          className="assessment-system-link"
                          onClick={() =>
                            navigate(
                              `/systems/${assessment.systemId}`
                            )
                          }
                        >
                          {assessment.systemName}
                        </button>

                        <span className="assessment-system-meta">
                          {assessment.systemOwner}
                          {" • "}
                          {assessment.environment}
                        </span>
                      </td>

                      <td>
                        <div className="assessment-control-cell">
                          <strong>
                            {assessment.controlCode}
                          </strong>

                          <span>
                            {assessment.controlName}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`control-status ${getStatusClass(
                            assessment.status
                          )}`}
                        >
                          {assessment.status}
                        </span>
                      </td>

                      <td>
                        <span className="assessment-evidence-count">
                          📄{" "}
                          {assessment.evidenceCount}
                        </span>
                      </td>

                      <td>
                        {assessment.analystNotes ||
                        assessment.findings ? (
                          <span className="notes-available">
                            Added
                          </span>
                        ) : (
                          <span className="notes-empty">
                            None
                          </span>
                        )}
                      </td>

                      <td>
                        <button
                          className="primary-button assessment-open-button"
                          onClick={() =>
                            navigate(
                              `/systems/${assessment.systemId}/controls/${assessment.controlCode}`
                            )
                          }
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Assessments;