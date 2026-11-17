import { useState } from "react";

import secureLensLogo from "../assets/Securelens-logo.png";
import { useAuth } from "../context/auth-context";

/*
 * Sign-in page. In "setup" mode (no users exist yet) it creates the
 * first admin account instead.
 */
export default function Login({ setup = false }) {
  const { signIn, completeSetup, notice } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Shown after a correct password when the account has MFA on.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (setup && password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      if (setup) {
        await completeSetup(username, password);
      } else {
        await signIn(username, password, needsCode ? code : undefined);
      }
    } catch (failure) {
      if (failure.mfaRequired) {
        // First time: just ask for the code. Afterwards: it was wrong.
        if (needsCode) setError(failure.message);
        setNeedsCode(true);
        setCode("");
      } else {
        setError(failure.message || "Sign-in failed.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand">
          <img src={secureLensLogo} alt="" className="securelens-logo" />
          <div>
            <h1>SecureLens</h1>
            <span>Security Assessment</span>
          </div>
        </div>

        <h2>
          {setup
            ? "Create the first admin account"
            : needsCode ? "Two-step verification" : "Sign in"}
        </h2>

        {setup && (
          <p>
            No accounts exist yet. This account will be able to add
            analysts and viewers. Setup is available only until the
            first account is created.
          </p>
        )}

        {!setup && !needsCode && notice && (
          <p className="assessment-message" role="status">
            {notice}
          </p>
        )}

        {error && (
          <p className="assessment-message" role="alert">
            {error}
          </p>
        )}

        {needsCode && (
          <>
            <p>
              Enter the 6-digit code from your authenticator app for{" "}
              <strong>{username}</strong>. If you lost your device, enter
              one of your recovery codes instead.
            </p>

            <div className="form-group">
              <label htmlFor="auth-code">Authentication code</label>
              <input
                id="auth-code"
                type="text"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                maxLength={32}
                required
                autoFocus
              />
            </div>
          </>
        )}

        <div hidden={needsCode}>
        <div className="form-group">
          <label htmlFor="auth-username">Username</label>
          <input
            id="auth-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={80}
            required
            autoFocus
          />
          {setup && <small>3–80 characters: letters, numbers, dot, dash, underscore.</small>}
        </div>

        <div className="form-group">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={setup ? 12 : undefined}
            maxLength={256}
            required
          />
          {setup && <small>At least 12 characters.</small>}
        </div>

        {setup && (
          <div className="form-group">
            <label htmlFor="auth-confirm">Confirm password</label>
            <input
              id="auth-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={12}
              maxLength={256}
              required
            />
          </div>
        )}

        </div>

        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting
            ? setup ? "Creating account..." : needsCode ? "Verifying..." : "Signing in..."
            : setup ? "Create Admin Account" : needsCode ? "Verify" : "Sign In"}
        </button>

        {needsCode && (
          <button
            type="button"
            className="secondary-button auth-back-button"
            onClick={() => {
              setNeedsCode(false);
              setPassword("");
              setError("");
            }}
          >
            Back
          </button>
        )}
      </form>
    </div>
  );
}
