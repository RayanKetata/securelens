import { useEffect, useState } from "react";

import { getControlHistory } from "../services/api";

function formatDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString();
}

/*
 * Read-only list of saved analyst decisions for one control.
 * `version` changes after each save so the list reloads.
 */
export default function AssessmentHistory({ systemId, controlCode, version }) {
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    getControlHistory(systemId, controlCode, controller.signal)
      .then((rows) => {
        setHistory(rows);
        setError("");
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setError(failure.message || "History could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [systemId, controlCode, version]);

  return (
    <div className="assessment-card assessment-history">
      <h3>Assessment History</h3>

      {loading && <p>Loading history...</p>}

      {error && (
        <p className="assessment-message" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && history.length === 0 && (
        <p>No saved decisions yet. Each save is recorded here.</p>
      )}

      {history.length > 0 && (
        <ol className="history-list">
          {history.map((entry) => (
            <li key={entry.id}>
              <strong>
                {entry.previousStatus === entry.newStatus
                  ? `${entry.newStatus} (details updated)`
                  : `${entry.previousStatus} → ${entry.newStatus}`}
              </strong>

              <span>
                {formatDate(entry.changedAt)}
                {entry.changedBy && ` · ${entry.changedBy}`}
              </span>

              {entry.analystNotes && (
                <details>
                  <summary>Notes and findings</summary>
                  <p>{entry.analystNotes}</p>
                  {entry.findings && <p>Findings: {entry.findings}</p>}
                </details>
              )}

              {!entry.analystNotes && entry.findings && (
                <details>
                  <summary>Findings</summary>
                  <p>{entry.findings}</p>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
