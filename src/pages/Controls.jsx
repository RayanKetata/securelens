import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { useSystems } from "../context/systems-context";
import controlCatalog from "../data/controlCatalog";
import InfoTooltip from "../components/InfoTooltip";

function Controls() {
  const navigate = useNavigate();

  const { systems } = useSystems();

  const [searchTerm, setSearchTerm] = useState("");
  const [familyFilter, setFamilyFilter] = useState("All");
  const [selectedControl, setSelectedControl] = useState(null);

  /*
   * Build usage information for every
   * control in our catalog.
   */
  const controlsWithUsage = useMemo(() => {
    return controlCatalog.map((catalogControl) => {
      const usages = [];

      systems.forEach((system) => {
        const assignedControl = system.controls.find(
          (control) => control.code === catalogControl.code
        );

        if (assignedControl) {
          usages.push({
            systemId: system.id,
            systemName: system.name,
            systemOwner: system.owner,
            environment: system.environment,
            status: assignedControl.status,
          });
        }
      });

      const metCount = usages.filter(
        (usage) => usage.status === "Met"
      ).length;

      const partiallyMetCount = usages.filter(
        (usage) => usage.status === "Partially Met"
      ).length;

      const notMetCount = usages.filter(
        (usage) => usage.status === "Not Met"
      ).length;

      const notAssessedCount = usages.filter(
        (usage) => usage.status === "Not Assessed"
      ).length;

      return {
        ...catalogControl,
        usages,
        usageCount: usages.length,
        metCount,
        partiallyMetCount,
        notMetCount,
        notAssessedCount,
      };
    });
  }, [systems]);

  /*
   * List of available families for
   * the filter dropdown.
   */
  const families = [
    "All",
    ...new Set(
      controlCatalog.map((control) => control.family)
    ),
  ];

  /*
   * Search + family filtering.
   */
  const filteredControls = controlsWithUsage.filter(
    (control) => {
      const search = searchTerm.toLowerCase();

      const matchesSearch =
        control.code.toLowerCase().includes(search) ||
        control.name.toLowerCase().includes(search) ||
        control.family.toLowerCase().includes(search) ||
        control.description.toLowerCase().includes(search);

      const matchesFamily =
        familyFilter === "All" ||
        control.family === familyFilter;

      return matchesSearch && matchesFamily;
    }
  );

  const usedControls = controlsWithUsage.filter(
    (control) => control.usageCount > 0
  ).length;

  const totalAssignments = controlsWithUsage.reduce(
    (total, control) => total + control.usageCount,
    0
  );

  const assessedAssignments = controlsWithUsage.reduce(
    (total, control) =>
      total +
      control.metCount +
      control.partiallyMetCount +
      control.notMetCount,
    0
  );

  function getStatusClass(status) {
    return status
      .toLowerCase()
      .replaceAll(" ", "-");
  }

  return (
    <div className="controls-page">
      <div className="page-header">
        <div>
          <h1>
            Security Controls
            <InfoTooltip
              text="Security controls are requirements used to evaluate how systems protect information, users, infrastructure, and operations."
            />
          </h1>

          <p>
            Browse the security-control catalog and review
            how controls are being used across SecureLens.
          </p>
        </div>
      </div>

      <div className="controls-summary-grid">
        <div className="summary-box">
          <span>Available Controls</span>
          <strong>{controlCatalog.length}</strong>
        </div>

        <div className="summary-box">
          <span>Controls In Use</span>
          <strong>{usedControls}</strong>
        </div>

        <div className="summary-box">
          <span>Total Assignments</span>
          <strong>{totalAssignments}</strong>
        </div>

        <div className="summary-box">
          <span>Assessed Assignments</span>
          <strong>{assessedAssignments}</strong>
        </div>
      </div>

      <div className="panel controls-library-panel">
        <div className="controls-library-header">
          <div>
            <h3>Control Catalog</h3>

            <p>
              Search the controls currently available in SecureLens.
            </p>
          </div>

          <div className="controls-filter-area">
            <input
              type="text"
              className="controls-search-input"
              placeholder="Search controls..."
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
            />

            <select
              className="controls-family-select"
              value={familyFilter}
              onChange={(event) =>
                setFamilyFilter(event.target.value)
              }
            >
              {families.map((family) => (
                <option key={family} value={family}>
                  {family === "All"
                    ? "All Families"
                    : family}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredControls.length === 0 ? (
          <div className="controls-empty-state">
            <h3>No controls found</h3>

            <p>
              Try changing your search or control-family filter.
            </p>
          </div>
        ) : (
          <div className="controls-grid">
            {filteredControls.map((control) => (
              <div
                className="control-catalog-card"
                key={control.code}
              >
                <div className="control-card-top">
                  <div>
                    <span className="catalog-control-code">
                      {control.code}
                    </span>

                    <h3>{control.name}</h3>
                  </div>

                  <InfoTooltip
                    text={`${control.code} belongs to the ${control.family} family. ${control.description}`}
                  />
                </div>

                <span className="catalog-family-badge">
                  {control.family}
                </span>

                <p className="catalog-control-description">
                  {control.description}
                </p>

                <div className="control-usage-section">
                  <div className="control-usage-header">
                    <span>
                      Used by
                    </span>

                    <strong>
                      {control.usageCount}{" "}
                      {control.usageCount === 1
                        ? "system"
                        : "systems"}
                    </strong>
                  </div>

                  {control.usageCount > 0 ? (
                    <div className="control-status-summary">
                      <div className="control-mini-stat">
                        <span className="mini-dot met"></span>

                        <span>Met</span>

                        <strong>
                          {control.metCount}
                        </strong>
                      </div>

                      <div className="control-mini-stat">
                        <span className="mini-dot partial"></span>

                        <span>Partial</span>

                        <strong>
                          {control.partiallyMetCount}
                        </strong>
                      </div>

                      <div className="control-mini-stat">
                        <span className="mini-dot not-met"></span>

                        <span>Not Met</span>

                        <strong>
                          {control.notMetCount}
                        </strong>
                      </div>

                      <div className="control-mini-stat">
                        <span className="mini-dot not-assessed"></span>

                        <span>Pending</span>

                        <strong>
                          {control.notAssessedCount}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div className="control-unused-message">
                      This control has not been assigned to a system yet.
                    </div>
                  )}
                </div>

                <div className="control-card-footer">
                  <button
                    className="secondary-button"
                    disabled={control.usageCount === 0}
                    onClick={() =>
                      setSelectedControl(control)
                    }
                  >
                    View Usage
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedControl && (
        <div className="modal-overlay">
          <div className="modal control-usage-modal">
            <div className="modal-header">
              <div>
                <span className="catalog-control-code">
                  {selectedControl.code}
                </span>

                <h2>{selectedControl.name}</h2>

                <p>
                  Systems currently using this security control.
                </p>
              </div>

              <button
                className="close-button"
                onClick={() => setSelectedControl(null)}
              >
                ×
              </button>
            </div>

            <div className="usage-modal-description">
              <span>Control Description</span>

              <p>
                {selectedControl.description}
              </p>
            </div>

            <div className="control-usage-list">
              {selectedControl.usages.map((usage) => (
                <div
                  className="control-usage-item"
                  key={usage.systemId}
                >
                  <div className="usage-system-info">
                    <strong>
                      {usage.systemName}
                    </strong>

                    <span>
                      {usage.systemOwner} • {usage.environment}
                    </span>
                  </div>

                  <span
                    className={`control-status ${getStatusClass(
                      usage.status
                    )}`}
                  >
                    {usage.status}
                  </span>

                  <button
                    className="view-button"
                    onClick={() => {
                      setSelectedControl(null);

                      navigate(
                        `/systems/${usage.systemId}/controls/${selectedControl.code}`
                      );
                    }}
                  >
                    Open Assessment
                  </button>
                </div>
              ))}
            </div>

            <div className="control-usage-modal-footer">
              <button
                className="secondary-button"
                onClick={() =>
                  setSelectedControl(null)
                }
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Controls;