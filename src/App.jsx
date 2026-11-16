import {
  useEffect,
  useState,
} from "react";

import "./App.css";

import {
  Routes,
  Route,
  NavLink,
  Link,
} from "react-router";

import { useSystems } from "./context/systems-context";
import { useAuth } from "./context/auth-context";
import { SystemsProvider } from "./context/SystemsContext.jsx";

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
import Login from "./pages/Login";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/systems", label: "Systems" },
  { to: "/assessments", label: "Assessments" },
  { to: "/controls", label: "Security Controls" },
  { to: "/evidence", label: "Evidence" },
  { to: "/reports", label: "Reports" },
];

function navClass({ isActive }) {
  return `nav-item ${isActive ? "active" : ""}`;
}

function NotFound() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Page Not Found</h1>

          <p>
            The page you requested does not exist.
          </p>

          <Link
            to="/"
            className="primary-button"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function readSavedTheme() {
  try {
    return localStorage.getItem(
      "securelens-theme"
    );
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(
      "securelens-theme",
      theme
    );
  } catch {
    // Storage can be unavailable (private mode); the theme still applies.
  }
}

function ThemeToggle({ darkMode, setDarkMode }) {
  const label = darkMode
    ? "Switch to light mode"
    : "Switch to dark mode";

  return (
    <div className="global-top-actions">
      <button
        type="button"
        className="theme-toggle"
        onClick={() =>
          setDarkMode(
            (current) => !current
          )
        }
        title={label}
        aria-label={label}
      >
        <span className="theme-toggle-icon">
          {darkMode ? "☀" : "☾"}
        </span>

        <span className="theme-toggle-text">
          {darkMode ? "Light" : "Dark"}
        </span>
      </button>
    </div>
  );
}

function AppSidebar({ user, onSignOut }) {
  return (
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
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={navClass}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        {user && (
          <div className="sidebar-user">
            <strong>{user.username}</strong>
            <span>{user.role}</span>
          </div>
        )}

        <NavLink
          to="/settings"
          className={navClass}
        >
          Settings
        </NavLink>

        <button
          type="button"
          className="nav-item sign-out-button"
          onClick={onSignOut}
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}

function AppRoutes({ darkMode, setDarkMode }) {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/systems" element={<Systems />} />
      <Route path="/systems/:id" element={<SystemDetails />} />
      <Route
        path="/systems/:id/controls/:controlCode"
        element={<ControlAssessment />}
      />
      <Route path="/assessments" element={<Assessments />} />
      <Route path="/controls" element={<Controls />} />
      <Route path="/evidence" element={<Evidence />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/reports/:id" element={<ReportDetails />} />
      <Route
        path="/settings"
        element={
          <Settings
            darkMode={darkMode}
            onDarkModeChange={setDarkMode}
          />
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function AppShell({ darkMode, setDarkMode }) {
  const {
    systemsError,
    loadSystems,
    loadingSystems,
  } = useSystems();

  const { user, signOut } = useAuth();

  return (
    <div className="app">
      <AppSidebar
        user={user}
        onSignOut={signOut}
      />

      <main className="main-content">
        <ThemeToggle
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />

        {systemsError && (
          <div
            className="assessment-message"
            role="alert"
          >
            {systemsError}{" "}
            <button
              type="button"
              className="secondary-button"
              onClick={loadSystems}
              disabled={loadingSystems}
            >
              {loadingSystems
                ? "Retrying..."
                : "Retry"}
            </button>
          </div>
        )}

        <AppRoutes
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
      </main>
    </div>
  );
}

function App() {
  const { status, user, retry } = useAuth();

  const [darkMode, setDarkMode] =
    useState(() => {
      const savedTheme =
        readSavedTheme();

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
    document.documentElement.classList.toggle(
      "dark-theme",
      darkMode
    );

    saveTheme(darkMode ? "dark" : "light");
  }, [darkMode]);

  if (status === "loading") {
    return (
      <div className="auth-page">
        <p role="status">Loading SecureLens...</p>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>Cannot reach the SecureLens API</h2>

          <p>
            Confirm the backend is running and that
            VITE_API_BASE_URL points to it.
          </p>

          <button
            type="button"
            className="primary-button"
            onClick={retry}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (status === "setup") {
    return <Login setup />;
  }

  if (status !== "signed-in") {
    return <Login />;
  }

  // Keyed by user so a different sign-in never sees cached data.
  return (
    <SystemsProvider key={user.id}>
      <AppShell
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />
    </SystemsProvider>
  );
}

export default App;
