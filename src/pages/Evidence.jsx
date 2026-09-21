import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { useSystems } from "../context/systems-context";
import InfoTooltip from "../components/InfoTooltip";

function Evidence() {
  const navigate = useNavigate();

  const {
    systems,
    removeEvidenceFromControl,
  } = useSystems();

  const [searchTerm, setSearchTerm] =
    useState("");

  /*
   * Collect every evidence file from
   * every system and every control.
   */
  const allEvidence = useMemo(() => {
    const evidenceItems = [];

    systems.forEach((system) => {
      system.controls.forEach((control) => {
        (control.evidence || []).forEach(
          (evidence) => {
            evidenceItems.push({
              ...evidence,

              systemId: system.id,
              systemName: system.name,

              controlCode: control.code,
              controlName: control.name,
            });
          }
        );
      });
    });

    return evidenceItems;
  }, [systems]);

  /*
   * Search
   */
  const filteredEvidence =
    allEvidence.filter((evidence) => {
      const search =
        searchTerm.toLowerCase();

      return (
        evidence.name
          .toLowerCase()
          .includes(search) ||
        evidence.systemName
          .toLowerCase()
          .includes(search) ||
        evidence.controlCode
          .toLowerCase()
          .includes(search) ||
        evidence.controlName
          .toLowerCase()
          .includes(search)
      );
    });

  /*
   * View file
   */
  function handleViewEvidence(evidence) {
    if (!evidence.file) {
      alert(
        "This evidence file is no longer available in the current browser session."
      );

      return;
    }

    const fileUrl =
      URL.createObjectURL(
        evidence.file
      );

    window.open(
      fileUrl,
      "_blank"
    );
  }

  /*
   * Delete file
   */
  function handleDeleteEvidence(evidence) {
    const confirmed =
      window.confirm(
        `Remove "${evidence.name}"?\n\nThis will remove the file from ${evidence.systemName} → ${evidence.controlCode}.`
      );

    if (!confirmed) {
      return;
    }

    removeEvidenceFromControl(
      evidence.systemId,
      evidence.controlCode,
      evidence.id
    );
  }

  /*
   * Open the assessment that owns
   * this evidence.
   */
  function handleOpenAssessment(
    evidence
  ) {
    navigate(
      `/systems/${evidence.systemId}/controls/${evidence.controlCode}`
    );
  }

  /*
   * File size formatting
   */
  function formatFileSize(bytes) {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(
        bytes / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(1)} MB`;
  }

  /*
   * Date formatting
   */
  function formatUploadDate(date) {
    return new Date(
      date
    ).toLocaleString();
  }

  /*
   * Count how many systems currently
   * have at least one evidence file.
   */
  const systemsWithEvidence =
    systems.filter((system) =>
      system.controls.some(
        (control) =>
          (control.evidence || [])
            .length > 0
      )
    ).length;

  /*
   * Count unique controls that
   * contain evidence.
   */
  const controlsWithEvidence =
    systems.reduce(
      (total, system) =>
        total +
        system.controls.filter(
          (control) =>
            (control.evidence || [])
              .length > 0
        ).length,
      0
    );

  return (
    <div className="evidence-page">
      <div className="page-header">
        <div>
          <h1>
            Evidence Library
            <InfoTooltip
              text="The Evidence Library shows all security evidence uploaded across every system and security control."
            />
          </h1>

          <p>
            Review and manage evidence
            uploaded across SecureLens.
          </p>
        </div>
      </div>

      <div className="evidence-summary-grid">
        <div className="summary-box">
          <span>
            Total Evidence Files
          </span>

          <strong>
            {allEvidence.length}
          </strong>
        </div>

        <div className="summary-box">
          <span>
            Systems With Evidence
          </span>

          <strong>
            {systemsWithEvidence}
          </strong>
        </div>

        <div className="summary-box">
          <span>
            Controls With Evidence
          </span>

          <strong>
            {controlsWithEvidence}
          </strong>
        </div>
      </div>

      <div className="panel evidence-library-panel">
        <div className="evidence-library-header">
          <div>
            <h3>
              Uploaded Evidence
            </h3>

            <p>
              Evidence linked to security
              controls across all systems.
            </p>
          </div>

          <div className="evidence-search-wrapper">
            <input
              type="text"
              className="evidence-search-input"
              placeholder="Search evidence..."
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(
                  event.target.value
                )
              }
            />
          </div>
        </div>

        {allEvidence.length === 0 ? (
          <div className="global-evidence-empty">
            <div className="global-evidence-icon">
              📄
            </div>

            <h3>
              No evidence uploaded yet
            </h3>

            <p>
              Evidence uploaded from a
              security control assessment
              will appear here.
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
        ) : filteredEvidence.length === 0 ? (
          <div className="global-evidence-empty">
            <h3>
              No matching evidence
            </h3>

            <p>
              Try searching by filename,
              system, control code, or
              control name.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>File</th>

                  <th>
                    System
                    <InfoTooltip
                      text="The system this evidence belongs to."
                    />
                  </th>

                  <th>
                    Control
                    <InfoTooltip
                      text="The security control this evidence supports."
                    />
                  </th>

                  <th>Size</th>

                  <th>
                    Uploaded
                  </th>

                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filteredEvidence.map(
                  (evidence) => (
                    <tr
                      key={`${evidence.systemId}-${evidence.controlCode}-${evidence.id}`}
                    >
                      <td>
                        <div className="library-file-cell">
                          <div className="library-file-icon">
                            📄
                          </div>

                          <div className="library-file-name">
                            <strong>
                              {
                                evidence.name
                              }
                            </strong>

                            <span>
                              {evidence.type ||
                                "File"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <button
                          className="evidence-link-button"
                          onClick={() =>
                            navigate(
                              `/systems/${evidence.systemId}`
                            )
                          }
                        >
                          {
                            evidence.systemName
                          }
                        </button>
                      </td>

                      <td>
                        <div className="library-control-cell">
                          <strong>
                            {
                              evidence.controlCode
                            }
                          </strong>

                          <span>
                            {
                              evidence.controlName
                            }
                          </span>
                        </div>
                      </td>

                      <td>
                        {formatFileSize(
                          evidence.size
                        )}
                      </td>

                      <td>
                        {formatUploadDate(
                          evidence.uploadedAt
                        )}
                      </td>

                      <td>
                        <div className="library-evidence-actions">
                          <button
                            className="view-button"
                            onClick={() =>
                              handleViewEvidence(
                                evidence
                              )
                            }
                          >
                            View
                          </button>

                          <button
                            className="view-button"
                            onClick={() =>
                              handleOpenAssessment(
                                evidence
                              )
                            }
                          >
                            Assessment
                          </button>

                          <button
                            className="delete-control-button"
                            title="Remove evidence"
                            onClick={() =>
                              handleDeleteEvidence(
                                evidence
                              )
                            }
                          >
                            🗑
                          </button>
                        </div>
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

export default Evidence;