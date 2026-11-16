import { useNavigate } from "react-router";

import InfoTooltip from "./InfoTooltip";
import { buildRiskSummary } from "../utils/riskSummary";

function statusClass(status) {
  return status.toLowerCase().replaceAll(" ", "-");
}

/* Plain-language risk summary for one system's report. */
export default function RiskSummary({ system }) {
  const navigate = useNavigate();
  const summary = buildRiskSummary(system);

  return (
    <section className="panel risk-summary-panel">
      <div className="panel-header">
        <h3>
          Risk Summary
          <InfoTooltip text="Written from the saved control decisions, findings, and evidence. No AI is used, so the same data always gives the same summary." />
        </h3>

        <span className={`risk-badge ${statusClass(summary.rating)}`}>
          {summary.rating}
        </span>
      </div>

      <p className="risk-summary-headline">{summary.headline}</p>

      {summary.points.length > 0 && (
        <ul className="risk-summary-points">
          {summary.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}

      {summary.priorities.length > 0 && (
        <>
          <h4>Priority Gaps</h4>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Control</th>
                  <th>Status</th>
                  <th>Finding</th>
                  <th>Evidence</th>
                </tr>
              </thead>

              <tbody>
                {summary.priorities.map((gap) => (
                  <tr key={gap.code}>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() =>
                          navigate(
                            `/systems/${system.id}/controls/${encodeURIComponent(gap.code)}`
                          )
                        }
                      >
                        {gap.code}
                      </button>{" "}
                      {gap.name}
                    </td>
                    <td>
                      <span className={`control-status ${statusClass(gap.status)}`}>
                        {gap.status}
                      </span>
                    </td>
                    <td>{gap.finding}</td>
                    <td>{gap.evidenceCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {summary.families.length > 1 && (
        <>
          <h4>By Control Family</h4>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Family</th>
                  <th>Met</th>
                  <th>Partially Met</th>
                  <th>Not Met</th>
                  <th>Not Assessed</th>
                </tr>
              </thead>

              <tbody>
                {summary.families.map((family) => (
                  <tr key={family.family}>
                    <td>{family.family}</td>
                    <td>{family.met}</td>
                    <td>{family.partial}</td>
                    <td>{family.notMet}</td>
                    <td>{family.notAssessed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h4>Recommended Next Steps</h4>

      <ol className="risk-summary-steps">
        {summary.nextSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <p className="risk-summary-caveat">{summary.caveats.join(" ")}</p>
    </section>
  );
}
