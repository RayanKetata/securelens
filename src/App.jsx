import {
  useEffect,
  useState,
} from "react";

import "./App.css";

import {
  Routes,
  Route,
  NavLink,
} from "react-router";

import secureLensLogo from "./assets/Securelens-logo.png";

import Dashboard from "./pages/Dashboard";
import Systems from "./pages/Systems";
import SystemDetails from "./pages/SystemDetails";
import ControlAssessment from "./pages/ControlAssessment";

import Assessments from "./pages/Assessments";
import Controls from "./pages/Controls";
import Evidence from "./pages/Evidence";

import Reports from "./pages/Reports";
import ReportDetails from "./pages/ReportDetails";

import Settings from "./pages/Settings";

function App() {
  /*
   * DARK MODE
   */

  const [darkMode, setDarkMode] =
    useState(() => {
      const savedTheme =
        localStorage.getItem(
          "securelens-theme"
        );

      if (savedTheme) {
        return savedTheme === "dark";
      }

      return (
        window.matchMedia &&
        window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches
      );
    });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add(
        "dark-theme"
      );

      localStorage.setItem(
        "securelens-theme",
        "dark"
      );
    } else {
      document.documentElement.classList.remove(
        "dark-theme"
      );

      localStorage.setItem(
        "securelens-theme",
        "light"
      );
    }
  }, [darkMode]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-image-wrapper">
            <img
              src={secureLensLogo}
              alt="SecureLens"
              className="securelens-logo"
            />
          </div>

          <div>
            <h2>SecureLens</h2>

            <span>
              Security Assessment
            </span>
          </div>
        </div>

        <nav>
          <NavLink
            to="/"
            end
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? "active"
                  : ""
              }`
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/systems"
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? "active"
                  : ""
              }`
            }
          >
            Systems
          </NavLink>

          <NavLink
            to="/assessments"
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? "active"
                  : ""
              }`
            }
          >
            Assessments
          </NavLink>

          <NavLink
            to="/controls"
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? "active"
                  : ""
              }`
            }
          >
            Security Controls
          </NavLink>

          <NavLink
            to="/evidence"
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? "active"
                  : ""
              }`
            }
          >
            Evidence
          </NavLink>

          <NavLink
            to="/reports"
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? "active"
                  : ""
              }`
            }
          >
            Reports
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <NavLink
            to="/settings"
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? "active"
                  : ""
              }`
            }
          >
            Settings
          </NavLink>
        </div>
      </aside>

      <main className="main-content">
        <div className="global-top-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={() =>
              setDarkMode(
                (current) => !current
              )
            }
            title={
              darkMode
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            aria-label={
              darkMode
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
          >
            <span className="theme-toggle-icon">
              {darkMode
                ? "☀"
                : "☾"}
            </span>

            <span className="theme-toggle-text">
              {darkMode
                ? "Light"
                : "Dark"}
            </span>
          </button>
        </div>

        <Routes>
          <Route
            path="/"
            element={<Dashboard />}
          />

          <Route
            path="/systems"
            element={<Systems />}
          />

          <Route
            path="/systems/:id"
            element={<SystemDetails />}
          />

          <Route
            path="/systems/:id/controls/:controlCode"
            element={
              <ControlAssessment />
            }
          />

          <Route
            path="/assessments"
            element={<Assessments />}
          />

          <Route
            path="/controls"
            element={<Controls />}
          />

          <Route
            path="/evidence"
            element={<Evidence />}
          />

          <Route
            path="/reports"
            element={<Reports />}
          />

          <Route
            path="/reports/:id"
            element={
              <ReportDetails />
            }
          />

          <Route
            path="/settings"
            element={<Settings />}
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;