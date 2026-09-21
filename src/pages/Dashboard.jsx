import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useSystems } from "../context/systems-context";


function Dashboard() {
  const navigate = useNavigate();

  const {
    systems,
    loadingSystems,
    deleteSystem,
  } = useSystems();

  const [
    deletingSystemId,
    setDeletingSystemId,
  ] = useState(null);


  // -------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------

  const stats = useMemo(() => {
    const controls = systems.flatMap(
      (system) => system.controls || []
    );

    const met = controls.filter(
      (control) =>
        control.status === "Met"
    ).length;

    const partiallyMet = controls.filter(
      (control) =>
        control.status === "Partially Met"
    ).length;

    const notMet = controls.filter(
      (control) =>
        control.status === "Not Met"
    ).length;

    const assessed =
      met +
      partiallyMet +
      notMet;

    const compliance =
      assessed > 0
        ? Math.round(
            (met / assessed) * 100
          )
        : 0;

    return {
      systems: systems.length,
      controls: controls.length,
      assessed,
      met,
      partiallyMet,
      notMet,
      compliance,
    };
  }, [systems]);


  // -------------------------------------------------------
  // DELETE
  // -------------------------------------------------------

  async function handleDeleteSystem(
    system
  ) {
    const confirmed =
      window.confirm(
        `Delete "${system.name}"?\n\n` +
        "This will permanently delete this system, " +
        "its controls, assessments, and evidence."
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingSystemId(
        system.id
      );

      await deleteSystem(
        system.id
      );
    } catch (error) {
      console.error(
        "Failed to delete system:",
        error
      );

      window.alert(
        "The system could not be deleted."
      );
    } finally {
      setDeletingSystemId(
        null
      );
    }
  }


  // -------------------------------------------------------
  // COLOURS
  // -------------------------------------------------------

  function statusStyle(status) {
    if (status === "Completed") {
      return {
        color: "#22c55e",
        background:
          "rgba(34, 197, 94, 0.12)",
        border:
          "1px solid rgba(34, 197, 94, 0.3)",
      };
    }

    if (status === "In Progress") {
      return {
        color: "#60a5fa",
        background:
          "rgba(59, 130, 246, 0.12)",
        border:
          "1px solid rgba(59, 130, 246, 0.3)",
      };
    }

    return {
      color: "#94a3b8",
      background:
        "rgba(148, 163, 184, 0.08)",
      border:
        "1px solid rgba(148, 163, 184, 0.2)",
    };
  }


  function riskStyle(risk) {
    if (risk === "High") {
      return {
        color: "#f87171",
        background:
          "rgba(239, 68, 68, 0.12)",
        border:
          "1px solid rgba(239, 68, 68, 0.3)",
      };
    }

    if (risk === "Medium") {
      return {
        color: "#fbbf24",
        background:
          "rgba(245, 158, 11, 0.12)",
        border:
          "1px solid rgba(245, 158, 11, 0.3)",
      };
    }

    if (risk === "Low") {
      return {
        color: "#22c55e",
        background:
          "rgba(34, 197, 94, 0.12)",
        border:
          "1px solid rgba(34, 197, 94, 0.3)",
      };
    }

    return {
      color: "#94a3b8",
      background:
        "rgba(148, 163, 184, 0.08)",
      border:
        "1px solid rgba(148, 163, 184, 0.2)",
    };
  }


  // -------------------------------------------------------
  // LOADING
  // -------------------------------------------------------

  if (loadingSystems) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1>
              Dashboard
            </h1>

            <p>
              Loading dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }


  // -------------------------------------------------------
  // PAGE
  // -------------------------------------------------------

  return (
    <div className="page-container">

      {/* HEADER */}

      <div
        className="page-header"
        style={{
          marginBottom: "28px",
        }}
      >
        <div>
          <h1>
            Dashboard
          </h1>

          <p>
            Overview of your security
            assessment environment.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() =>
            navigate("/systems")
          }
        >
          Manage Systems
        </button>
      </div>


      {/* STAT CARDS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4, minmax(0, 1fr))",
          gap: "16px",
          marginBottom: "32px",
        }}
      >

        <StatCard
          label="Systems"
          value={stats.systems}
          description="Systems under assessment"
        />

        <StatCard
          label="Security Controls"
          value={stats.controls}
          description="Total assigned controls"
        />

        <StatCard
          label="Controls Assessed"
          value={stats.assessed}
          description="Completed assessments"
        />

        <StatCard
          label="Compliance"
          value={`${stats.compliance}%`}
          description="Controls currently met"
        />

      </div>


      {/* ASSESSMENT OVERVIEW */}

      <section
        style={{
          marginBottom: "34px",
        }}
      >
        <div
          style={{
            marginBottom: "16px",
          }}
        >
          <h2
            style={{
              marginBottom: "6px",
            }}
          >
            Assessment Overview
          </h2>

          <p
            style={{
              margin: 0,
              color: "#94a3b8",
            }}
          >
            Current results across all
            systems and controls.
          </p>
        </div>


        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: "16px",
          }}
        >

          <AssessmentCard
            label="Met"
            value={stats.met}
            color="#22c55e"
          />

          <AssessmentCard
            label="Partially Met"
            value={stats.partiallyMet}
            color="#f59e0b"
          />

          <AssessmentCard
            label="Not Met"
            value={stats.notMet}
            color="#ef4444"
          />

        </div>
      </section>


      {/* SYSTEMS */}

      <section>

        <div
          style={{
            marginBottom: "16px",
          }}
        >
          <h2
            style={{
              marginBottom: "6px",
            }}
          >
            Systems
          </h2>

          <p
            style={{
              margin: 0,
              color: "#94a3b8",
            }}
          >
            View or manage systems
            currently being assessed.
          </p>
        </div>


        {systems.length === 0 ? (

          <div
            style={{
              padding: "32px",
              border:
                "1px solid #263449",
              borderRadius: "12px",
              background: "#111827",
              textAlign: "center",
            }}
          >
            <h3>
              No systems yet
            </h3>

            <p
              style={{
                color: "#94a3b8",
              }}
            >
              Create your first system
              to begin an assessment.
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={() =>
                navigate("/systems")
              }
            >
              Manage Systems
            </button>
          </div>

        ) : (

          <div
            style={{
              display: "grid",
              gap: "14px",
            }}
          >

            {systems.map(
              (system) => {

                const progress =
                  system.progress || 0;

                return (
                  <div
                    key={system.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(240px, 1.5fr) minmax(220px, 1fr) auto",
                      alignItems: "center",
                      gap: "24px",

                      padding: "20px",

                      background:
                        "#111827",

                      border:
                        "1px solid #263449",

                      borderRadius:
                        "12px",
                    }}
                  >

                    {/* SYSTEM INFO */}

                    <div>
                      <h3
                        style={{
                          margin:
                            "0 0 6px",
                          fontSize:
                            "17px",
                        }}
                      >
                        {system.name}
                      </h3>

                      <p
                        style={{
                          margin:
                            "0 0 12px",
                          color:
                            "#94a3b8",
                          fontSize:
                            "14px",
                        }}
                      >
                        {system.owner ||
                          "No owner assigned"}
                      </p>


                      <div
                        style={{
                          display:
                            "flex",
                          flexWrap:
                            "wrap",
                          alignItems:
                            "center",
                          gap: "8px",
                        }}
                      >

                        <span
                          style={{
                            fontSize:
                              "13px",
                            color:
                              "#cbd5e1",
                          }}
                        >
                          {system.environment ||
                            "No environment"}
                        </span>


                        <span
                          style={{
                            ...statusStyle(
                              system.status
                            ),

                            padding:
                              "4px 8px",

                            borderRadius:
                              "999px",

                            fontSize:
                              "11px",

                            fontWeight:
                              "600",
                          }}
                        >
                          {system.status ||
                            "Not Started"}
                        </span>


                        <span
                          style={{
                            ...riskStyle(
                              system.risk
                            ),

                            padding:
                              "4px 8px",

                            borderRadius:
                              "999px",

                            fontSize:
                              "11px",

                            fontWeight:
                              "600",
                          }}
                        >
                          {system.risk ||
                            "Not Assessed"}
                        </span>

                      </div>
                    </div>


                    {/* PROGRESS */}

                    <div>

                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          marginBottom:
                            "8px",
                          fontSize:
                            "13px",
                        }}
                      >
                        <span
                          style={{
                            color:
                              "#94a3b8",
                          }}
                        >
                          Assessment Progress
                        </span>

                        <strong>
                          {progress}%
                        </strong>
                      </div>


                      <div
                        style={{
                          width: "100%",
                          height: "8px",
                          background:
                            "#263449",
                          borderRadius:
                            "999px",
                          overflow:
                            "hidden",
                        }}
                      >
                        <div
                          style={{
                            width:
                              `${progress}%`,
                            height:
                              "100%",
                            background:
                              "#2563eb",
                            borderRadius:
                              "999px",
                            transition:
                              "width 0.25s ease",
                          }}
                        />
                      </div>

                    </div>


                    {/* BUTTONS */}

                    <div
                      style={{
                        display: "flex",
                        alignItems:
                          "center",
                        gap: "8px",
                      }}
                    >

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          navigate(
                            `/systems/${system.id}`
                          )
                        }
                      >
                        View
                      </button>


                      <button
                        type="button"
                        title={`Delete ${system.name}`}
                        aria-label={`Delete ${system.name}`}
                        disabled={
                          deletingSystemId ===
                          system.id
                        }
                        onClick={() =>
                          handleDeleteSystem(
                            system
                          )
                        }
                        style={{
                          width: "40px",
                          height: "40px",

                          display:
                            "inline-flex",

                          alignItems:
                            "center",

                          justifyContent:
                            "center",

                          background:
                            "transparent",

                          color:
                            "#94a3b8",

                          border:
                            "1px solid #334155",

                          borderRadius:
                            "8px",

                          cursor:
                            deletingSystemId ===
                            system.id
                              ? "not-allowed"
                              : "pointer",

                          opacity:
                            deletingSystemId ===
                            system.id
                              ? 0.5
                              : 1,
                        }}
                      >

                        {deletingSystemId ===
                        system.id ? (
                          "..."
                        ) : (
                          <TrashIcon />
                        )}

                      </button>

                    </div>

                  </div>
                );
              }
            )}

          </div>

        )}

      </section>

    </div>
  );
}


// ---------------------------------------------------------
// STAT CARD
// ---------------------------------------------------------

function StatCard({
  label,
  value,
  description,
}) {
  return (
    <div
      style={{
        padding: "20px",

        background: "#111827",

        border:
          "1px solid #263449",

        borderRadius: "12px",
      }}
    >

      <div
        style={{
          color: "#94a3b8",
          fontSize: "13px",
          marginBottom: "8px",
        }}
      >
        {label}
      </div>


      <div
        style={{
          fontSize: "28px",
          fontWeight: "700",
          marginBottom: "6px",
        }}
      >
        {value}
      </div>


      <div
        style={{
          color: "#64748b",
          fontSize: "12px",
        }}
      >
        {description}
      </div>

    </div>
  );
}


// ---------------------------------------------------------
// ASSESSMENT CARD
// ---------------------------------------------------------

function AssessmentCard({
  label,
  value,
  color,
}) {
  return (
    <div
      style={{
        padding: "18px 20px",

        display: "flex",
        alignItems: "center",
        justifyContent:
          "space-between",

        background: "#111827",

        border:
          "1px solid #263449",

        borderRadius: "12px",
      }}
    >

      <span
        style={{
          color: "#cbd5e1",
          fontWeight: "600",
        }}
      >
        {label}
      </span>


      <strong
        style={{
          color,
          fontSize: "24px",
        }}
      >
        {value}
      </strong>

    </div>
  );
}


// ---------------------------------------------------------
// TRASH ICON
// ---------------------------------------------------------

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}


export default Dashboard;