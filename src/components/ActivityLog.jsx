import { useEffect, useState } from "react";

import { downloadActivityCsv, getActivity } from "../services/api";

const PAGE_SIZE = 50;

const CATEGORIES = [
  ["", "All activity"],
  ["auth", "Sign-ins and passwords"],
  ["user", "User accounts"],
  ["system", "Systems"],
  ["control", "Controls and assessments"],
  ["evidence", "Evidence"],
  ["ai", "AI analysis"],
];

function formatDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/* Admin-only, read-only view of the activity log, newest first. */
export default function ActivityLog() {
  const [category, setCategory] = useState("");
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    getActivity({ category, limit: PAGE_SIZE }, controller.signal)
      .then((page) => {
        setRows(page);
        setHasMore(page.length === PAGE_SIZE);
        setError("");
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setError(failure.message || "Activity could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [category, reloadKey]);

  function changeCategory(value) {
    setLoading(true);
    setRows([]);
    setCategory(value);
  }

  function refresh() {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  async function loadMore() {
    setLoadingMore(true);

    try {
      const page = await getActivity({
        category,
        limit: PAGE_SIZE,
        before: rows[rows.length - 1]?.id,
      });

      setRows((current) => [...current, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (failure) {
      setError(failure.message || "Activity could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError("");

    try {
      await downloadActivityCsv({ category });
    } catch (failure) {
      setError(failure.message || "The activity log could not be exported.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="assessment-card">
      <div className="section-title-row">
        <h2>Activity Log</h2>

        <div className="control-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <p>
        Sign-ins, account changes, and every change to systems,
        controls, and evidence, plus AI suggestions. Entries cannot be
        edited or deleted from the app.
      </p>

      <div className="form-group">
        <label htmlFor="activity-category">Show</label>
        <select
          id="activity-category"
          value={category}
          onChange={(event) => changeCategory(event.target.value)}
        >
          {CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="assessment-message" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p>No activity recorded yet.</p>
      )}

      {rows.length > 0 && (
        <div className="table-container">
          <table className="activity-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>Address</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    row.action.endsWith("_failed") ? "activity-failed" : undefined
                  }
                >
                  <td>{formatDate(row.occurredAt)}</td>
                  <td>{row.actor || "—"}</td>
                  <td>{row.summary}</td>
                  <td>{row.client || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          className="secondary-button"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading..." : "Load Older Entries"}
        </button>
      )}
    </section>
  );
}
