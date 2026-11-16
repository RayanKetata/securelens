import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { openEvidenceFile, searchEvidence } from "../services/api";
import { splitHighlights } from "../utils/highlight";

function Highlighted({ text, terms }) {
  return splitHighlights(text, terms).map((part, index) =>
    part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>
  );
}

/*
 * Search inside evidence: the text extracted from every file
 * (including OCR text from scans and images) and the filenames.
 */
export default function EvidenceSearch({ systems }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [systemId, setSystemId] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState(null);
  const pending = useRef(null);

  useEffect(() => () => pending.current?.abort(), []);

  async function runSearch(event) {
    event.preventDefault();
    const q = query.trim();

    if (q.length < 2) {
      setError("Enter at least two characters.");
      setOutcome(null);
      return;
    }

    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setSearching(true);
    setError("");

    try {
      const found = await searchEvidence({ q, systemId }, controller.signal);
      if (!controller.signal.aborted) setOutcome({ ...found, query: q });
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure.message || "Search failed.");
        setOutcome(null);
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setSearching(false);
      }
    }
  }

  function clear() {
    pending.current?.abort();
    setQuery("");
    setOutcome(null);
    setError("");
  }

  function view(result) {
    openEvidenceFile(result.id).catch((failure) =>
      setError(failure.message || "This evidence file cannot be opened.")
    );
  }

  return (
    <section className="panel evidence-text-search" aria-labelledby="evidence-text-search-title">
      <h3 id="evidence-text-search-title">Search Inside Evidence</h3>
      <p>
        Finds files whose text contains every word you enter, including text read from scans and
        screenshots. Put a phrase in quotes to match it exactly, for example{" "}
        <code>"access review"</code>.
      </p>

      <form className="evidence-text-search-form" onSubmit={runSearch} role="search">
        <label className="visually-hidden" htmlFor="evidence-text-query">Search text</label>
        <input
          id="evidence-text-query"
          type="search"
          className="evidence-search-input"
          placeholder='e.g. MFA administrators, "restore test"'
          value={query}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
        />

        <label className="visually-hidden" htmlFor="evidence-text-system">System</label>
        <select
          id="evidence-text-system"
          value={systemId}
          onChange={(event) => setSystemId(event.target.value)}
        >
          <option value="">All systems</option>
          {systems.map((system) => (
            <option key={system.id} value={system.id}>{system.name}</option>
          ))}
        </select>

        <button type="submit" className="primary-button" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>

        {(outcome || error) && (
          <button type="button" className="secondary-button" onClick={clear}>
            Clear
          </button>
        )}
      </form>

      {error && <p className="assessment-message" role="alert">{error}</p>}

      {outcome && (
        <div aria-live="polite">
          <p className="evidence-search-count">
            {outcome.results.length === 0
              ? `No evidence contains ${outcome.terms.map((term) => `"${term}"`).join(" and ")}.`
              : `${outcome.results.length} file${outcome.results.length === 1 ? "" : "s"} found${outcome.truncated ? " (best matches from the first 200; refine your search to see others)" : ""}.`}
          </p>

          <ul className="evidence-search-results">
            {outcome.results.map((result) => (
              <li key={result.id}>
                <div className="evidence-search-result-head">
                  <strong><Highlighted text={result.name} terms={outcome.terms} /></strong>
                  {result.extractionMethod?.includes("ocr") && (
                    <span className="ocr-badge" title="Text was read with OCR and may contain errors.">OCR</span>
                  )}
                  <span className="evidence-search-where">
                    {result.systemName} · {result.controlCode} {result.controlName}
                  </span>
                </div>

                {result.snippet ? (
                  <p className="evidence-search-snippet">
                    <Highlighted text={result.snippet} terms={outcome.terms} />
                  </p>
                ) : (
                  <p className="evidence-search-snippet muted">Matched the filename only.</p>
                )}

                <div className="evidence-search-actions">
                  {result.matches > 0 && (
                    <span>{result.matches} match{result.matches === 1 ? "" : "es"} in the text</span>
                  )}
                  <button type="button" className="view-button" onClick={() => view(result)}>View</button>
                  <button
                    type="button"
                    className="view-button"
                    onClick={() => navigate(`/systems/${result.systemId}/controls/${encodeURIComponent(result.controlCode)}`)}
                  >
                    Assessment
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
