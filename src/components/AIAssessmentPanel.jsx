import { useEffect, useRef, useState } from "react";
import { analyzeControlEvidence } from "../services/api";

export default function AIAssessmentPanel({ systemId, control, disabled, onApply }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [applied, setApplied] = useState(false);
  const pendingRequest = useRef(null);
  const ready = control.evidence?.some(item => item.extractionStatus === "completed");
  const skipped = control.evidence?.filter(item => item.extractionStatus !== "completed") || [];

  useEffect(() => () => pendingRequest.current?.abort(), []);

  async function analyze() {
    if (pendingRequest.current) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setAnalyzing(true);
    setError("");
    setResult(null);
    setApplied(false);
    const timeout = setTimeout(() => controller.abort("timeout"), 75000);
    try {
      const suggestion = await analyzeControlEvidence(systemId, control.code, controller.signal);
      if (!controller.signal.aborted) setResult(suggestion);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
      else if (controller.signal.reason === "timeout") setError("AI analysis timed out. Please try again.");
    } finally {
      clearTimeout(timeout);
      pendingRequest.current = null;
      if (!controller.signal.aborted || controller.signal.reason === "timeout") setAnalyzing(false);
    }
  }

  return (
    <section className="assessment-card ai-assessment" aria-busy={analyzing}>
      <div className="section-title-row">
        <h2>AI-Assisted Review</h2>
        <button type="button" className="primary-button" disabled={!ready || disabled || analyzing} onClick={analyze}>
          {analyzing ? "Analyzing evidence…" : result ? "Analyze Again" : "Analyze Evidence"}
        </button>
      </div>
      <p>Send extracted evidence to OpenAI for a suggested assessment of this control description. You make the final decision.</p>
      {!ready && <p>Upload a PDF or TXT file with successfully extracted text to begin.</p>}
      {skipped.length > 0 && <p role="status">Excluded because text is unavailable: {skipped.map(item => item.name).join(", ")}. Image-only PDFs need a text version.</p>}
      {analyzing && <p role="status">Reviewing the available evidence. This may take up to a minute.</p>}
      {error && <p role="alert" className="assessment-message">{error}</p>}
      {result && <div className="ai-result" aria-live="polite">
        <div className="control-info-grid">
          <div><span className="detail-label">Suggested Status</span><strong>{result.suggestedStatus}</strong></div>
          <div><span className="detail-label">Confidence</span><strong>{result.confidence}</strong></div>
        </div>
        <p>{result.reasoning}</p>
        <h3>Evidence Found</h3>
        {result.evidenceFound.length ? <ul>{result.evidenceFound.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No supporting facts identified.</p>}
        <h3>Gaps</h3>
        {result.gaps.length ? <ul>{result.gaps.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No gaps identified against the supplied description.</p>}
        <h3>Files Reviewed</h3>
        <ul>{result.evidenceFiles.map((name, index) => <li key={index}>{name}</li>)}</ul>
        <p>Confidence is the model’s estimate, not a calibrated compliance score. Suggestions are temporary and clear when evidence changes or you leave this page.</p>
        <div className="assessment-actions">
          <button type="button" className="secondary-button" disabled={disabled || applied} onClick={() => { onApply(result); setApplied(true); }}>
            {applied ? "Applied to Draft" : "Apply Suggested Status to Draft"}
          </button>
          <button type="button" className="secondary-button" onClick={() => setResult(null)}>Dismiss Suggestion</button>
        </div>
      </div>}
    </section>
  );
}
