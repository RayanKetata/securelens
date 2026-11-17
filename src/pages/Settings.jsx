import { useCallback, useEffect, useState } from "react";

import { API_BASE_URL, getHealth } from "../services/api";
import { useSystems } from "../context/systems-context";
import InfoTooltip from "../components/InfoTooltip";
import UserManagement from "../components/UserManagement";
import ChangePassword from "../components/ChangePassword";
import TwoFactorSettings from "../components/TwoFactorSettings";
import ActivityLog from "../components/ActivityLog";
import { useAuth } from "../context/auth-context";

function Settings({ darkMode, onDarkModeChange }) {
  const {
    systems,
    loadingSystems,
    systemsError,
    loadSystems,
  } = useSystems();

  const { user, isAdmin } = useAuth();

  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");
  const [checking, setChecking] = useState(true);

  const runHealthCheck = useCallback(async () => {
    setChecking(true);
    setHealthError("");

    try {
      setHealth(await getHealth());
    } catch (error) {
      setHealth(null);
      setHealthError(
        error.message || "The API could not be reached."
      );
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    getHealth()
      .then((data) => {
        if (active) setHealth(data);
      })
      .catch((error) => {
        if (active) {
          setHealthError(
            error.message || "The API could not be reached."
          );
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const controlCount = systems.reduce(
    (total, system) => total + system.controls.length,
    0
  );

  const evidenceCount = systems.reduce(
    (total, system) => total + (system.evidenceCount || 0),
    0
  );

  let apiStatus = "Checking...";

  if (!checking) {
    apiStatus = health ? "Connected" : "Unavailable";
  }

  let aiStatus = "Unknown";

  if (health) {
    aiStatus = health.aiConfigured
      ? "Configured"
      : "Not configured (set OPENAI_API_KEY on the server)";
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Settings</h1>

          <p>
            Manage appearance and check the SecureLens
            backend connection.
          </p>
        </div>
      </div>

      <div className="assessment-layout">
        <div className="assessment-main">
          <section className="assessment-card">
            <div className="section-title-row">
              <h2>Appearance</h2>

              <InfoTooltip text="Your theme choice is saved in this browser only." />
            </div>

            <div className="assessment-options">
              <button
                type="button"
                className={`assessment-option ${!darkMode ? "selected" : ""}`}
                aria-pressed={!darkMode}
                onClick={() => onDarkModeChange(false)}
              >
                <strong>Light</strong>
                <span>Bright background for well-lit spaces.</span>
              </button>

              <button
                type="button"
                className={`assessment-option ${darkMode ? "selected" : ""}`}
                aria-pressed={darkMode}
                onClick={() => onDarkModeChange(true)}
              >
                <strong>Dark</strong>
                <span>Reduced glare for low-light work.</span>
              </button>
            </div>
          </section>

          <section className="assessment-card">
            <div className="section-title-row">
              <h2>Backend Connection</h2>

              <button
                type="button"
                className="secondary-button"
                onClick={runHealthCheck}
                disabled={checking}
              >
                {checking ? "Checking..." : "Check Again"}
              </button>
            </div>

            <div className="sidebar-detail">
              <span>API URL</span>
              <strong>{API_BASE_URL}</strong>
            </div>

            <div className="sidebar-detail">
              <span>API status</span>
              <strong role="status">{apiStatus}</strong>
            </div>

            <div className="sidebar-detail">
              <span>AI review</span>
              <strong>{aiStatus}</strong>
            </div>

            {health?.aiModel && (
              <div className="sidebar-detail">
                <span>AI model</span>
                <strong>{health.aiModel}</strong>
              </div>
            )}

            {health && (
              <div className="sidebar-detail">
                <span>OCR for scans and images</span>
                <strong>
                  {health.ocrAvailable
                    ? "Available"
                    : "Not available (install Tesseract on the server)"}
                </strong>
              </div>
            )}

            {healthError && (
              <p className="assessment-message" role="alert">
                {healthError}. Confirm the backend is running and
                that VITE_API_BASE_URL points to it.
              </p>
            )}
          </section>

          {isAdmin && <UserManagement />}

          {isAdmin && <ActivityLog />}
        </div>

        <aside className="assessment-sidebar">
          <div className="assessment-card">
            <h3>Your Account</h3>

            <div className="sidebar-detail">
              <span>Username</span>
              <strong>{user?.username}</strong>
            </div>

            <div className="sidebar-detail">
              <span>Role</span>
              <strong>{user?.role}</strong>
            </div>

            <p>
              Sessions end after 12 hours or when this browser tab
              closes. If you forget your password, an admin can
              reset it.
            </p>

            <ChangePassword />

            <TwoFactorSettings />
          </div>

          <div className="assessment-card">
            <h3>Data</h3>

            <div className="sidebar-detail">
              <span>Systems</span>
              <strong>{systems.length}</strong>
            </div>

            <div className="sidebar-detail">
              <span>Controls</span>
              <strong>{controlCount}</strong>
            </div>

            <div className="sidebar-detail">
              <span>Evidence files</span>
              <strong>{evidenceCount}</strong>
            </div>

            {systemsError && (
              <p className="assessment-message" role="alert">
                {systemsError}
              </p>
            )}

            <button
              type="button"
              className="secondary-button"
              onClick={loadSystems}
              disabled={loadingSystems}
            >
              {loadingSystems ? "Reloading..." : "Reload Data"}
            </button>
          </div>

          <div className="assessment-card">
            <h3>About</h3>

            <p>
              SecureLens suggests assessments with AI, but the
              analyst always makes and saves the final decision.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Settings;
