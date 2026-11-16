import { useState } from "react";
import { useNavigate } from "react-router";
import { useSystems } from "../context/systems-context";
import { useAuth } from "../context/auth-context";

function Systems() {
  const {
    systems,
    loadingSystems,
    addSystem,
  } = useSystems();

  const navigate = useNavigate();

  const { canEdit } = useAuth();

  const [showForm, setShowForm] = useState(false);

  const [creating, setCreating] = useState(false);

  const [formError, setFormError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    owner: "",
    environment: "Development",
    description: "",
  });

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData({
      ...formData,
      [name]: value,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setCreating(true);
    setFormError("");

    const created = await addSystem(formData);

    setCreating(false);

    if (!created) {
      setFormError(
        "The system could not be created. Check the details and try again."
      );

      return;
    }

    setFormData({
      name: "",
      owner: "",
      environment: "Development",
      description: "",
    });

    setShowForm(false);
  }

  return (
    <div className="systems-page">
      <div className="page-header">
        <div>
          <h1>Systems</h1>

          <p>
            Manage the applications and infrastructure being
            assessed by SecureLens.
          </p>
        </div>

        <button
          className="primary-button"
          disabled={!canEdit}
          title={canEdit ? undefined : "Viewers cannot add systems"}
          onClick={() => setShowForm(true)}
        >
          + Add System
        </button>
      </div>

      <div className="systems-summary">
        <div className="summary-box">
          <span>Total Systems</span>
          <strong>{systems.length}</strong>
        </div>

        <div className="summary-box">
          <span>In Progress</span>

          <strong>
            {
              systems.filter(
                (system) =>
                  system.status === "In Progress"
              ).length
            }
          </strong>
        </div>

        <div className="summary-box">
          <span>Completed</span>

          <strong>
            {
              systems.filter(
                (system) =>
                  system.status === "Completed"
              ).length
            }
          </strong>
        </div>

        <div className="summary-box">
          <span>Not Started</span>

          <strong>
            {
              systems.filter(
                (system) =>
                  system.status === "Not Started"
              ).length
            }
          </strong>
        </div>
      </div>

      <div className="panel systems-table-panel">
        <div className="panel-header systems-table-header">
          <div>
            <h3>Registered Systems</h3>
            <p>
              Select a system to view its security assessment.
            </p>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>System</th>
                <th>Owner</th>
                <th>Environment</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Risk</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {loadingSystems && (
                <tr>
                  <td colSpan={7}>Loading systems...</td>
                </tr>
              )}

              {!loadingSystems && systems.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    No systems yet. Select{" "}
                    <strong>+ Add System</strong> to
                    register your first system.
                  </td>
                </tr>
              )}

              {systems.map((system) => (
                <tr key={system.id}>
                  <td className="system-name">
                    {system.name}
                  </td>

                  <td>{system.owner}</td>

                  <td>
                    <span className="environment-badge">
                      {system.environment}
                    </span>
                  </td>

                  <td>
                    <span
                      className={`status-badge ${system.status
                        .toLowerCase()
                        .replaceAll(" ", "-")}`}
                    >
                      {system.status}
                    </span>
                  </td>

                  <td>
                    <div className="table-progress">
                      <div className="small-progress-bar">
                        <div
                          className="small-progress-fill"
                          style={{
                            width: `${system.progress}%`,
                          }}
                        ></div>
                      </div>

                      <span>{system.progress}%</span>
                    </div>
                  </td>

                  <td>
                    <span
                      className={`risk-badge ${system.risk
                        .toLowerCase()
                        .replaceAll(" ", "-")}`}
                    >
                      {system.risk}
                    </span>
                  </td>

                  <td>
                    <button
                      className="view-button"
                      onClick={() =>
                        navigate(
                          `/systems/${system.id}`
                        )
                      }
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2>Add System</h2>

                <p>
                  Create a new system for security
                  assessment.
                </p>
              </div>

              <button
                className="close-button"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {formError && (
                <div
                  className="assessment-message"
                  role="alert"
                >
                  {formError}
                </div>
              )}

              <div className="form-group">
                <label>System Name</label>

                <input
                  type="text"
                  name="name"
                  placeholder="Employee Payroll System"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Business Owner</label>

                <input
                  type="text"
                  name="owner"
                  placeholder="Human Resources"
                  value={formData.owner}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Environment</label>

                <select
                  name="environment"
                  value={formData.environment}
                  onChange={handleChange}
                >
                  <option value="Development">
                    Development
                  </option>

                  <option value="Testing">
                    Testing
                  </option>

                  <option value="Staging">
                    Staging
                  </option>

                  <option value="Production">
                    Production
                  </option>
                </select>
              </div>

              <div className="form-group">
                <label>Description</label>

                <textarea
                  name="description"
                  placeholder="Describe what this system does..."
                  value={formData.description}
                  onChange={handleChange}
                  rows="4"
                ></textarea>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={creating}
                >
                  {creating
                    ? "Creating..."
                    : "Create System"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Systems;