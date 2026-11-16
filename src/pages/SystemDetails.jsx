import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { useSystems } from "../context/systems-context";
import { useAuth } from "../context/auth-context";
import InfoTooltip from "../components/InfoTooltip";
import controlCatalog from "../data/controlCatalog";

function SystemDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    systems,
    loadingSystems,
    addControlsToSystem,
    removeControlFromSystem,
    editSystem,
    removeSystem,
  } = useSystems();

  const { canEdit } = useAuth();

  const [showControlModal, setShowControlModal] =
    useState(false);

  const [selectedControls, setSelectedControls] =
    useState([]);

  const [searchTerm, setSearchTerm] = useState("");

  const [message, setMessage] = useState("");

  const [editForm, setEditForm] = useState(null);

  const [busy, setBusy] = useState(false);

  const system = systems.find(
    (currentSystem) =>
      currentSystem.id.toString() === id
  );

  if (loadingSystems) {
    return (
      <div className="system-details-page">
        <h1>Loading system...</h1>
      </div>
    );
  }

  if (!system) {
    return (
      <div className="system-details-page">
        <h1>System Not Found</h1>

        <p>
          The system you are looking for does not exist.
        </p>

        <button
          className="primary-button"
          onClick={() => navigate("/systems")}
        >
          Back to Systems
        </button>
      </div>
    );
  }

  const metControls = system.controls.filter(
    (control) => control.status === "Met"
  ).length;

  const partiallyMetControls =
    system.controls.filter(
      (control) =>
        control.status === "Partially Met"
    ).length;

  const notMetControls = system.controls.filter(
    (control) => control.status === "Not Met"
  ).length;

  const existingControlCodes = system.controls.map(
    (control) => control.code
  );

  const availableControls = controlCatalog.filter(
    (control) =>
      !existingControlCodes.includes(control.code)
  );

  const filteredControls =
    availableControls.filter((control) => {
      const search = searchTerm.toLowerCase();

      return (
        control.code.toLowerCase().includes(search) ||
        control.name.toLowerCase().includes(search) ||
        control.family.toLowerCase().includes(search)
      );
    });

  function toggleControl(code) {
    setSelectedControls((current) => {
      if (current.includes(code)) {
        return current.filter(
          (selectedCode) =>
            selectedCode !== code
        );
      }

      return [...current, code];
    });
  }

  function controlPath(control) {
    return `/systems/${system.id}/controls/${encodeURIComponent(control.code)}`;
  }

  async function handleDeleteControl(control) {
    const confirmed = window.confirm(
      `Remove ${control.code} — ${control.name} from this system?\n\nAny assessment information and evidence saved for this control will also be removed.`
    );

    if (!confirmed) {
      return;
    }

    setMessage("");

    const success = await removeControlFromSystem(
      system.id,
      control.code
    );

    if (!success) {
      setMessage(`${control.code} could not be removed.`);
    }
  }

  async function handleAddControls() {
    const controls = controlCatalog.filter(
      (control) =>
        selectedControls.includes(control.code)
    );

    setBusy(true);
    setMessage("");

    const created = await addControlsToSystem(
      system.id,
      controls
    );

    setBusy(false);

    if (!created) {
      setMessage("The selected controls could not be added.");
      return;
    }

    setSelectedControls([]);
    setSearchTerm("");
    setShowControlModal(false);
  }

  /*
   * Start Assessment: open the first control that still
   * needs review, or prompt to add controls when none exist.
   */
  function handleStartAssessment() {
    if (system.controls.length === 0) {
      setShowControlModal(true);
      return;
    }

    const nextControl =
      system.controls.find(
        (control) =>
          control.status === "Not Assessed"
      ) || system.controls[0];

    navigate(controlPath(nextControl));
  }

  function openEditForm() {
    setEditForm({
      name: system.name,
      owner: system.owner,
      environment: system.environment,
      description: system.description || "",
    });
  }

  function handleEditChange(event) {
    const { name, value } = event.target;

    setEditForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleEditSubmit(event) {
    event.preventDefault();

    setBusy(true);
    setMessage("");

    const updated = await editSystem(
      system.id,
      editForm
    );

    setBusy(false);

    if (!updated) {
      setMessage("The system details could not be saved.");
      return;
    }

    setEditForm(null);
    setMessage("System details updated.");
  }

  async function handleDeleteSystem() {
    const confirmed = window.confirm(
      `Delete "${system.name}"?\n\nThis permanently deletes the system, its controls, assessments, and evidence.`
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);

    const success = await removeSystem(system.id);

    setBusy(false);

    if (success) {
      navigate("/systems");
    } else {
      setMessage("The system could not be deleted.");
    }
  }

  function closeControlModal() {
    setSelectedControls([]);
    setSearchTerm("");
    setShowControlModal(false);
  }

  function getControlExplanation(control) {
    const catalogControl = controlCatalog.find(
      (item) => item.code === control.code
    );

    if (catalogControl) {
      return `${catalogControl.code} — ${catalogControl.name}. ${catalogControl.description}`;
    }

    return `${control.code} is a security control used to evaluate ${control.name}.`;
  }

  return (
    <div className="system-details-page">
      <button
        className="back-button"
        onClick={() => navigate("/systems")}
      >
        ← Back to Systems
      </button>

      <div className="system-details-header">
        <div>
          <div className="system-title-row">
            <h1>{system.name}</h1>

            <span
              className={`status-badge ${system.status
                .toLowerCase()
                .replaceAll(" ", "-")}`}
            >
              {system.status}
            </span>
          </div>

          <p>{system.description}</p>
        </div>

        <div className="control-modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={openEditForm}
            disabled={busy || !canEdit}
          >
            Edit Details
          </button>

          <button
            type="button"
            className="danger-button"
            onClick={handleDeleteSystem}
            disabled={busy || !canEdit}
          >
            Delete System
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handleStartAssessment}
          >
            {system.controls.length === 0
              ? "Start Assessment"
              : system.status === "Completed"
                ? "Review Assessment"
                : "Continue Assessment"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className="assessment-message"
          role="status"
        >
          {message}
        </div>
      )}

      <div className="system-information-grid">
        <div className="system-info-card">
          <span>
            Business Owner
            <InfoTooltip
              text="The department, team, or individual responsible for this system."
            />
          </span>

          <strong>{system.owner}</strong>
        </div>

        <div className="system-info-card">
          <span>
            Environment
            <InfoTooltip
              text="The environment where the system is currently operating, such as Development, Testing, Staging, or Production."
            />
          </span>

          <strong>{system.environment}</strong>
        </div>

        <div className="system-info-card">
          <span>
            Overall Progress
            <InfoTooltip
              text="The percentage of security controls that have been reviewed for this system."
            />
          </span>

          <strong>{system.progress}%</strong>
        </div>

        <div className="system-info-card">
          <span>
            Risk Level
            <InfoTooltip
              text="The overall level of security risk identified for this system based on its current assessment results."
            />
          </span>

          <strong
            className={`risk-text ${system.risk
              .toLowerCase()
              .replaceAll(" ", "-")}`}
          >
            {system.risk}
          </strong>
        </div>
      </div>

      <div className="system-details-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>
              Assessment Overview
              <InfoTooltip
                text="A summary of how many security controls are Met, Partially Met, or Not Met for this system."
              />
            </h3>

            <p>
              Current assessment progress for this system.
            </p>
          </div>

          <div className="system-score-section">
            <div className="score-circle system-score">
              <span>{system.progress}%</span>
            </div>

            <div className="assessment-stats">
              <div className="assessment-stat">
                <span className="status-indicator met"></span>

                <div>
                  <strong>{metControls}</strong>

                  <p>
                    Met
                    <InfoTooltip
                      text="Sufficient evidence has been provided to demonstrate that the control requirements are satisfied."
                    />
                  </p>
                </div>
              </div>

              <div className="assessment-stat">
                <span className="status-indicator partial"></span>

                <div>
                  <strong>
                    {partiallyMetControls}
                  </strong>

                  <p>
                    Partially Met
                    <InfoTooltip
                      text="Some requirements are satisfied, but additional evidence or security measures are still required."
                    />
                  </p>
                </div>
              </div>

              <div className="assessment-stat">
                <span className="status-indicator not-met"></span>

                <div>
                  <strong>{notMetControls}</strong>

                  <p>
                    Not Met
                    <InfoTooltip
                      text="The available evidence does not demonstrate that the control requirements are satisfied."
                    />
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel evidence-summary-card">
          <div className="panel-header">
            <h3>
              Evidence
              <InfoTooltip
                text="Documents, screenshots, policies, procedures, and other files used to demonstrate whether security controls are satisfied."
              />
            </h3>

            <p>
              Documentation associated with this system.
            </p>
          </div>

          <div className="evidence-number">
            {system.evidenceCount}
          </div>

          <span className="evidence-label">
            Evidence files uploaded
          </span>

          <button
            className="secondary-button evidence-button"
            onClick={() => navigate("/evidence")}
          >
            View Evidence
          </button>
        </div>
      </div>

      <div className="panel control-section">
        <div className="control-section-header">
          <div>
            <h3>
              Security Controls
              <InfoTooltip
                text="Security requirements used to evaluate whether this system has appropriate safeguards and protections in place."
              />
            </h3>

            <p>
              Controls included in this system's security
              assessment.
            </p>
          </div>

          <button
            className="primary-button"
            disabled={!canEdit}
            onClick={() =>
              setShowControlModal(true)
            }
          >
            + Add Control
          </button>
        </div>

        {system.controls.length === 0 ? (
          <div className="empty-state">
            <h3>No security controls yet</h3>

            <p>
              Add security controls to begin assessing
              this system.
            </p>

            <button
              className="primary-button empty-state-button"
              disabled={!canEdit}
              onClick={() =>
                setShowControlModal(true)
              }
            >
              + Add Security Control
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>
                    Control
                    <InfoTooltip
                      text="The identifier assigned to a security requirement. For example, AC-2 means Access Control, Control 2."
                    />
                  </th>

                  <th>Name</th>

                  <th>
                    Status
                    <InfoTooltip
                      text="Shows whether the available evidence demonstrates that the control is Met, Partially Met, Not Met, or has not yet been assessed."
                    />
                  </th>

                  <th></th>
                </tr>
              </thead>

              <tbody>
                {system.controls.map((control) => (
                  <tr key={control.code}>
                    <td>
                      <strong>{control.code}</strong>

                      <InfoTooltip
                        text={getControlExplanation(
                          control
                        )}
                      />
                    </td>

                    <td>{control.name}</td>

                    <td>
                      <span
                        className={`control-status ${control.status
                          .toLowerCase()
                          .replaceAll(" ", "-")}`}
                      >
                        {control.status}
                      </span>
                    </td>

                    <td>
                        <div className="control-actions">
                            <button
                                className="view-button"
                                onClick={() =>
                                    navigate(controlPath(control))
                                }
                                >
                                Assess
                            </button>

                            <button
                                className="delete-control-button"
                                disabled={!canEdit}
                                onClick={() => handleDeleteControl(control)}
                                title={`Remove ${control.code}`}
                                aria-label={`Remove ${control.code}`}
                            >
                                🗑
                            </button>
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showControlModal && (
        <div className="modal-overlay">
          <div className="modal control-modal">
            <div className="modal-header">
              <div>
                <h2>Add Security Controls</h2>

                <p>
                  Select one or more controls to add to{" "}
                  <strong>{system.name}</strong>.
                </p>
              </div>

              <button
                className="close-button"
                onClick={closeControlModal}
              >
                ×
              </button>
            </div>

            <div className="control-search-container">
              <input
                type="text"
                className="control-search"
                placeholder="Search by code, name, or family..."
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(
                    event.target.value
                  )
                }
              />
            </div>

            {availableControls.length === 0 ? (
              <div className="all-controls-added">
                <h3>
                  All available controls have been added
                </h3>

                <p>
                  This system already contains every
                  control currently available in
                  SecureLens.
                </p>
              </div>
            ) : (
              <div className="control-selection-list">
                {filteredControls.length === 0 ? (
                  <div className="control-search-empty">
                    No controls match your search.
                  </div>
                ) : (
                  filteredControls.map((control) => {
                    const selected =
                      selectedControls.includes(
                        control.code
                      );

                    return (
                      <label
                        key={control.code}
                        className={`control-option ${
                          selected
                            ? "selected"
                            : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            toggleControl(
                              control.code
                            )
                          }
                        />

                        <div className="control-option-content">
                          <div className="control-option-title">
                            <strong>
                              {control.code}
                            </strong>

                            <span>
                              {control.name}
                            </span>
                          </div>

                          <div className="control-family">
                            {control.family}
                          </div>

                          <p>
                            {control.description}
                          </p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            )}

            <div className="control-modal-footer">
              <span>
                {selectedControls.length} selected
              </span>

              <div className="control-modal-actions">
                <button
                  className="secondary-button"
                  onClick={closeControlModal}
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  disabled={
                    selectedControls.length === 0 ||
                    busy ||
                    !canEdit
                  }
                  onClick={handleAddControls}
                >
                  Add{" "}
                  {selectedControls.length > 0
                    ? selectedControls.length
                    : ""}{" "}
                  Control
                  {selectedControls.length === 1
                    ? ""
                    : "s"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2>Edit System</h2>

                <p>
                  Update the details for this system.
                </p>
              </div>

              <button
                type="button"
                className="close-button"
                aria-label="Close"
                onClick={() => setEditForm(null)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label htmlFor="edit-system-name">
                  System Name
                </label>

                <input
                  id="edit-system-name"
                  type="text"
                  name="name"
                  value={editForm.name}
                  onChange={handleEditChange}
                  maxLength={200}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-system-owner">
                  Business Owner
                </label>

                <input
                  id="edit-system-owner"
                  type="text"
                  name="owner"
                  value={editForm.owner}
                  onChange={handleEditChange}
                  maxLength={200}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-system-environment">
                  Environment
                </label>

                <select
                  id="edit-system-environment"
                  name="environment"
                  value={editForm.environment}
                  onChange={handleEditChange}
                >
                  {[
                    "Development",
                    "Testing",
                    "Staging",
                    "Production",
                    editForm.environment,
                  ]
                    .filter(
                      (value, index, all) =>
                        all.indexOf(value) === index
                    )
                    .map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="edit-system-description">
                  Description
                </label>

                <textarea
                  id="edit-system-description"
                  name="description"
                  value={editForm.description}
                  onChange={handleEditChange}
                  rows="4"
                ></textarea>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditForm(null)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={busy}
                >
                  {busy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SystemDetails;