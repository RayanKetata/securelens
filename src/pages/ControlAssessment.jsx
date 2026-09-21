import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { getEvidenceText } from "../services/api";
import { useSystems } from "../context/systems-context";
import InfoTooltip from "../components/InfoTooltip";
import AIAssessmentPanel from "../components/AIAssessmentPanel";


function ControlAssessment() {
  const { id, controlCode } = useParams();
  const navigate = useNavigate();

  const {
    systems,
    loadingSystems,
    systemsError,
  } = useSystems();


  // -------------------------------------------------------
  // FIND SYSTEM + CONTROL
  // -------------------------------------------------------

  const system = systems.find(
    (item) =>
      String(item.id) === String(id)
  );

  const decodedControlCode =
    controlCode || "";

  const control = system?.controls?.find(
    (item) =>
      item.code === decodedControlCode
  );


  if (systemsError && !system) {
    return <div className="page-container" role="alert">{systemsError}</div>;
  }

  // -------------------------------------------------------
  // LOADING
  // -------------------------------------------------------

  if (loadingSystems) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>
            Control Assessment
          </h1>

          <p>
            Loading assessment...
          </p>
        </div>
      </div>
    );
  }


  // -------------------------------------------------------
  // SYSTEM NOT FOUND
  // -------------------------------------------------------

  if (!system) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>
            System Not Found
          </h1>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate("/systems")
            }
          >
            Back to Systems
          </button>
        </div>
      </div>
    );
  }


  // -------------------------------------------------------
  // CONTROL NOT FOUND
  // -------------------------------------------------------

  if (!control) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>
            Control Not Found
          </h1>

          <p>
            {decodedControlCode} is not
            assigned to {system.name}.
          </p>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(
                `/systems/${system.id}`
              )
            }
          >
            Back to System
          </button>
        </div>
      </div>
    );
  }


  return <AssessmentForm key={control.id} system={system} control={control} />;
}

function AssessmentForm({ system, control }) {
  const navigate = useNavigate();
  const { updateControlAssessment, addEvidenceToControl, removeEvidenceFromControl } = useSystems();
  // -------------------------------------------------------
  // LOCAL FORM STATE
  // -------------------------------------------------------

  const [
    assessmentStatus,
    setAssessmentStatus,
  ] = useState(control.status || "Not Assessed");

  const [
    analystNotes,
    setAnalystNotes,
  ] = useState(control.analystNotes || "");

  const [
    findings,
    setFindings,
  ] = useState(control.findings || "");

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    selectedEvidenceText,
    setSelectedEvidenceText,
  ] = useState(null);

  const [
    loadingEvidenceText,
    setLoadingEvidenceText,
  ] = useState(false);

  const [
    evidenceTextError,
    setEvidenceTextError,
  ] = useState("");


  // -------------------------------------------------------
  // SAVE ASSESSMENT
  // -------------------------------------------------------

  async function handleSaveAssessment(
    returnToSystem = false
  ) {
    if (!system || !control) {
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const result =
        await updateControlAssessment(
          system.id,
          control.code,
          {
            status: assessmentStatus,
            analystNotes,
            findings,
          }
        );

      if (!result) {
        setMessage(
          "The assessment could not be saved."
        );

        return;
      }

      setMessage(
        "Assessment saved successfully."
      );

      if (returnToSystem) {
        navigate(
          `/systems/${system.id}`
        );
      }
    } catch (error) {
      console.error(
        "Failed to save assessment:",
        error
      );

      setMessage(
        "The assessment could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }


  // -------------------------------------------------------
  // UPLOAD EVIDENCE
  // -------------------------------------------------------

  async function handleEvidenceUpload(event) {
    const files = Array.from(
      event.target.files || []
    );

    event.target.value = "";

    if (
      files.length === 0 ||
      !system ||
      !control
    ) {
      return;
    }

    try {
      setUploading(true);
      setMessage("");

      for (const file of files) {
        const extension =
          file.name
            .split(".")
            .pop()
            ?.toLowerCase();

        if (
          extension !== "pdf" &&
          extension !== "txt"
        ) {
          setMessage(
            `${file.name} was skipped. Only PDF and TXT files are allowed.`
          );

          continue;
        }

        const uploaded =
          await addEvidenceToControl(
            system.id,
            control.code,
            file
          );

        if (!uploaded) {
          setMessage(
            `Failed to upload ${file.name}.`
          );

          continue;
        }
      }
    } catch (error) {
      console.error(
        "Failed to upload evidence:",
        error
      );

      setMessage(
        "Evidence upload failed."
      );
    } finally {
      setUploading(false);
    }
  }


  // -------------------------------------------------------
  // VIEW ORIGINAL EVIDENCE
  // -------------------------------------------------------

  function handleViewEvidence(
    evidence
  ) {
    if (!evidence?.downloadUrl) {
      console.error(
        "No download URL found for this evidence."
      );

      setMessage(
        "This evidence file cannot be opened."
      );

      return;
    }

    window.open(
      evidence.downloadUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }


  // -------------------------------------------------------
  // VIEW EXTRACTED TEXT
  // -------------------------------------------------------

  async function handleViewExtractedText(
    evidence
  ) {
    if (!evidence?.id) {
      return;
    }

    try {
      setLoadingEvidenceText(true);
      setEvidenceTextError("");
      setSelectedEvidenceText(null);

      const result =
        await getEvidenceText(
          evidence.id
        );

      setSelectedEvidenceText(
        result
      );
    } catch (error) {
      console.error(
        "Failed to load extracted text:",
        error
      );

      setEvidenceTextError(
        "Could not load the extracted text."
      );
    } finally {
      setLoadingEvidenceText(false);
    }
  }


  // -------------------------------------------------------
  // CLOSE EXTRACTED TEXT
  // -------------------------------------------------------

  function handleCloseExtractedText() {
    setSelectedEvidenceText(null);
    setEvidenceTextError("");
  }


  // -------------------------------------------------------
  // DELETE EVIDENCE
  // -------------------------------------------------------

  async function handleDeleteEvidence(
    evidence
  ) {
    if (
      !system ||
      !control ||
      !evidence
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Remove "${evidence.name}" from this control?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setMessage("");

      const success =
        await removeEvidenceFromControl(
          system.id,
          control.code,
          evidence.id
        );

      if (!success) {
        setMessage(
          "The evidence could not be removed."
        );

        return;
      }

      if (
        selectedEvidenceText?.id ===
        evidence.id
      ) {
        setSelectedEvidenceText(null);
      }

      setMessage(
        "Evidence removed successfully."
      );
    } catch (error) {
      console.error(
        "Failed to delete evidence:",
        error
      );

      setMessage(
        "The evidence could not be removed."
      );
    }
  }


  // -------------------------------------------------------
  // FILE HELPERS
  // -------------------------------------------------------

  function formatFileSize(bytes) {
    if (
      bytes === null ||
      bytes === undefined
    ) {
      return "Unknown size";
    }

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


  function formatDate(value) {
    if (!value) {
      return "Unknown date";
    }

    const date = new Date(value);

    if (Number.isNaN(
      date.getTime()
    )) {
      return value;
    }

    return date.toLocaleString();
  }


  // -------------------------------------------------------
  // PAGE
  // -------------------------------------------------------

  return (
    <div className="page-container">

      {/* HEADER */}

      <div className="page-header">
        <div>
          <button
            type="button"
            className="back-button"
            onClick={() =>
              navigate(
                `/systems/${system.id}`
              )
            }
          >
            ← Back to {system.name}
          </button>

          <h1>
            {control.code} —{" "}
            {control.name}
          </h1>

          <p>
            Assess this security control
            and review its supporting
            evidence.
          </p>
        </div>
      </div>


      {/* MESSAGE */}

      {message && (
        <div className="assessment-message">
          {message}
        </div>
      )}


      <div className="assessment-layout">

        {/* MAIN */}

        <div className="assessment-main">

          {/* CONTROL INFORMATION */}

          <section className="assessment-card">
            <div className="section-title-row">
              <h2>
                Control Information
              </h2>

              <InfoTooltip
                text="Information about the selected security control."
              />
            </div>

            <div className="control-info-grid">

              <div>
                <span className="detail-label">
                  Control
                </span>

                <strong>
                  {control.code}
                </strong>
              </div>


              <div>
                <span className="detail-label">
                  Family
                </span>

                <strong>
                  {control.family}
                </strong>
              </div>


              <div className="control-description">
                <span className="detail-label">
                  Description
                </span>

                <p>
                  {control.description}
                </p>
              </div>

            </div>
          </section>


          <AIAssessmentPanel
            key={JSON.stringify(control.evidence?.map(item => [item.id, item.extractionStatus]))}
            systemId={system.id}
            control={control}
            disabled={uploading || saving}
            onApply={(result) => {
              setAssessmentStatus(result.suggestedStatus);
              setMessage("AI status applied to your draft. Review it and save the assessment to confirm.");
            }}
          />

          {/* ASSESSMENT STATUS */}

          <section className="assessment-card">
            <div className="section-title-row">
              <h2>
                Assessment Status
              </h2>

              <InfoTooltip
                text="Choose the assessment result based on the available evidence."
              />
            </div>


            <div className="assessment-options">

              <button
                type="button"
                className={`assessment-option ${
                  assessmentStatus === "Met"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setAssessmentStatus(
                    "Met"
                  )
                }
              >
                <strong>
                  Met
                </strong>

                <span>
                  The control requirements
                  are satisfied.
                </span>
              </button>


              <button
                type="button"
                className={`assessment-option ${
                  assessmentStatus ===
                  "Partially Met"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setAssessmentStatus(
                    "Partially Met"
                  )
                }
              >
                <strong>
                  Partially Met
                </strong>

                <span>
                  Some requirements are
                  satisfied, but gaps
                  remain.
                </span>
              </button>


              <button
                type="button"
                className={`assessment-option ${
                  assessmentStatus ===
                  "Not Met"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setAssessmentStatus(
                    "Not Met"
                  )
                }
              >
                <strong>
                  Not Met
                </strong>

                <span>
                  The control requirements
                  are not sufficiently
                  demonstrated.
                </span>
              </button>

            </div>


            {assessmentStatus ===
              "Not Assessed" && (
              <p className="assessment-pending-text">
                This control has not yet
                been assessed.
              </p>
            )}
          </section>


          {/* ANALYST NOTES */}

          <section className="assessment-card">
            <div className="section-title-row">
              <h2>
                Analyst Notes
              </h2>

              <InfoTooltip
                text="Record observations from your review of the control and supporting evidence."
              />
            </div>

            <textarea
              value={analystNotes}
              onChange={(event) =>
                setAnalystNotes(
                  event.target.value
                )
              }
              placeholder="Enter analyst notes..."
              rows={6}
            />
          </section>


          {/* FINDINGS */}

          <section className="assessment-card">
            <div className="section-title-row">
              <h2>
                Findings
              </h2>

              <InfoTooltip
                text="Document gaps, deficiencies, risks, or other important findings."
              />
            </div>

            <textarea
              value={findings}
              onChange={(event) =>
                setFindings(
                  event.target.value
                )
              }
              placeholder="Enter findings..."
              rows={6}
            />
          </section>


          {/* EVIDENCE */}

          <section className="assessment-card evidence-panel">

            <div className="section-title-row">
              <div>
                <h2>
                  Supporting Evidence
                </h2>

                <p>
                  Upload PDF or TXT files
                  that support this
                  assessment.
                </p>
              </div>

              <InfoTooltip
                text="Evidence uploaded here is associated with this specific system and security control."
              />
            </div>


            {/* UPLOAD */}

            <div className="evidence-upload-area">
              <label className="upload-evidence-button">

                {uploading
                  ? "Uploading..."
                  : "Upload Evidence"}

                <input
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  multiple
                  disabled={uploading}
                  onChange={
                    handleEvidenceUpload
                  }
                  style={{
                    display: "none",
                  }}
                />
              </label>

              <p>
                PDF and TXT files only.
                Maximum 10 MB per file.
              </p>
            </div>


            {/* EVIDENCE LIST */}

            <div className="evidence-list">

              {control.evidence?.length >
              0 ? (

                control.evidence.map(
                  (evidence) => (

                    <div
                      className="evidence-item"
                      key={evidence.id}
                    >

                      <div className="evidence-file-info">

                        <strong>
                          {evidence.name}
                        </strong>

                        <span>
                          {formatFileSize(
                            evidence.size
                          )}

                          {" • "}

                          {formatDate(
                            evidence.uploadedAt
                          )}
                        </span>

                        {evidence.extractionStatus && (
                          <span>
                            Text extraction:{" "}
                            <strong>
                              {
                                evidence.extractionStatus
                              }
                            </strong>
                          </span>
                        )}

                      </div>


                      <div className="evidence-actions">

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            handleViewEvidence(
                              evidence
                            )
                          }
                        >
                          View
                        </button>


                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            handleViewExtractedText(
                              evidence
                            )
                          }
                        >
                          View Extracted Text
                        </button>


                        <button
                          type="button"
                          className="danger-button"
                          onClick={() =>
                            handleDeleteEvidence(
                              evidence
                            )
                          }
                        >
                          Remove
                        </button>

                      </div>

                    </div>
                  )
                )

              ) : (

                <div className="empty-evidence">
                  <p>
                    No evidence has been
                    uploaded for this
                    control.
                  </p>
                </div>

              )}

            </div>


            {/* EXTRACTED TEXT LOADING */}

            {loadingEvidenceText && (
              <div
                className="extracted-text-panel"
                style={{
                  marginTop: "20px",
                  padding: "18px",
                  border:
                    "1px solid var(--border-color, #d1d5db)",
                  borderRadius: "8px",
                }}
              >
                <p>
                  Loading extracted text...
                </p>
              </div>
            )}


            {/* EXTRACTED TEXT ERROR */}

            {evidenceTextError && (
              <div
                className="extracted-text-panel"
                style={{
                  marginTop: "20px",
                  padding: "18px",
                  border:
                    "1px solid var(--border-color, #d1d5db)",
                  borderRadius: "8px",
                }}
              >
                <strong>
                  Error
                </strong>

                <p>
                  {evidenceTextError}
                </p>
              </div>
            )}


            {/* EXTRACTED TEXT PREVIEW */}

            {selectedEvidenceText && (
              <div
                className="extracted-text-panel"
                style={{
                  marginTop: "20px",
                  padding: "20px",
                  border:
                    "1px solid var(--border-color, #d1d5db)",
                  borderRadius: "8px",
                }}
              >

                <div className="section-title-row">

                  <div>
                    <h3>
                      Extracted Text
                    </h3>

                    <p>
                      {
                        selectedEvidenceText.name
                      }
                    </p>
                  </div>


                  <button
                    type="button"
                    className="secondary-button"
                    onClick={
                      handleCloseExtractedText
                    }
                  >
                    Close
                  </button>

                </div>


                <p>
                  Extraction Status:{" "}

                  <strong>
                    {
                      selectedEvidenceText.extractionStatus
                    }
                  </strong>
                </p>


                {selectedEvidenceText.extractedText ? (

                  <pre
                    style={{
                      whiteSpace:
                        "pre-wrap",
                      overflowWrap:
                        "break-word",
                      maxHeight:
                        "450px",
                      overflowY:
                        "auto",
                      padding:
                        "16px",
                      marginTop:
                        "15px",
                      borderRadius:
                        "6px",
                      fontFamily:
                        "inherit",
                      lineHeight:
                        "1.6",
                      background:
                        "rgba(127, 127, 127, 0.08)",
                    }}
                  >
                    {
                      selectedEvidenceText.extractedText
                    }
                  </pre>

                ) : (

                  <div
                    style={{
                      marginTop: "15px",
                    }}
                  >
                    <p>
                      No text could be
                      extracted from this
                      file.
                    </p>

                    {selectedEvidenceText.extractionStatus ===
                      "empty" && (
                      <p>
                        This may be a
                        scanned PDF or an
                        image-only
                        document.
                      </p>
                    )}

                    {selectedEvidenceText.extractionStatus ===
                      "failed" && (
                      <p>
                        SecureLens was
                        unable to process
                        this document.
                      </p>
                    )}
                  </div>

                )}

              </div>
            )}

          </section>


          {/* SAVE BUTTONS */}

          <div className="assessment-actions">

            <button
              type="button"
              className="secondary-button"
              disabled={saving}
              onClick={() =>
                handleSaveAssessment(
                  false
                )
              }
            >
              {saving
                ? "Saving..."
                : "Save Assessment"}
            </button>


            <button
              type="button"
              className="primary-button"
              disabled={saving}
              onClick={() =>
                handleSaveAssessment(
                  true
                )
              }
            >
              {saving
                ? "Saving..."
                : "Save & Return"}
            </button>

          </div>

        </div>


        {/* SIDEBAR */}

        <aside className="assessment-sidebar">

          <div className="assessment-card">

            <h3>
              System
            </h3>


            <div className="sidebar-detail">
              <span>
                Name
              </span>

              <strong>
                {system.name}
              </strong>
            </div>


            <div className="sidebar-detail">
              <span>
                Owner
              </span>

              <strong>
                {system.owner}
              </strong>
            </div>


            <div className="sidebar-detail">
              <span>
                Environment
              </span>

              <strong>
                {system.environment}
              </strong>
            </div>


            <div className="sidebar-detail">
              <span>
                Overall Progress
              </span>

              <strong>
                {system.progress}%
              </strong>
            </div>


            <div className="sidebar-detail">
              <span>
                Risk
              </span>

              <strong>
                {system.risk}
              </strong>
            </div>

          </div>


          <div className="assessment-card">

            <h3>
              Current Assessment
            </h3>


            <div className="sidebar-detail">
              <span>
                Status
              </span>

              <strong>
                {assessmentStatus}
              </strong>
            </div>


            <div className="sidebar-detail">
              <span>
                Evidence
              </span>

              <strong>
                {control.evidence
                  ?.length || 0}
              </strong>
            </div>

          </div>

        </aside>

      </div>

    </div>
  );
}


export default ControlAssessment;