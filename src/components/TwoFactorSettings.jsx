import { useState } from "react";
import QRCode from "qrcode";

import { useAuth } from "../context/auth-context";
import {
  disableMfa,
  enableMfa,
  regenerateRecoveryCodes,
  startMfaSetup,
} from "../services/api";

/*
 * Lets a signed-in user turn two-step verification (an authenticator
 * app code at sign-in) on or off, and replace their recovery codes.
 *
 * step:
 *   "idle"       status and buttons
 *   "password"   confirm the password before setup starts
 *   "scan"       QR code and the first code
 *   "codes"      recovery codes, shown once
 *   "disable"    password + code to turn it off
 *   "renew"      password + code to replace recovery codes
 */
export default function TwoFactorSettings() {
  const { user, refreshUser } = useAuth();

  const [step, setStep] = useState("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const enabled = Boolean(user?.mfaEnabled);

  function go(next) {
    setStep(next);
    setPassword("");
    setCode("");
    setError("");
    setMessage("");
  }

  async function run(action) {
    setBusy(true);
    setError("");

    try {
      await action();
    } catch (failure) {
      setError(failure.message || "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleStart(event) {
    event.preventDefault();
    run(async () => {
      const result = await startMfaSetup(password);
      const qr = await QRCode.toDataURL(result.otpauthUri, { margin: 1, width: 200 });
      setSetup({ ...result, qr });
      go("scan");
    });
  }

  function handleEnable(event) {
    event.preventDefault();
    run(async () => {
      const result = await enableMfa(code);
      setRecoveryCodes(result.recoveryCodes);
      go("codes");
      setSetup(null);
    });
  }

  function handleDisable(event) {
    event.preventDefault();
    run(async () => {
      await disableMfa(password, code);
      await refreshUser();
      go("idle");
      setMessage("Two-step verification is off.");
    });
  }

  function handleRenew(event) {
    event.preventDefault();
    run(async () => {
      const result = await regenerateRecoveryCodes(password, code);
      setRecoveryCodes(result.recoveryCodes);
      go("codes");
    });
  }

  async function finishCodes() {
    setRecoveryCodes([]);
    go("idle");
    await refreshUser().catch(() => {});
    setMessage(
      "Two-step verification is on. Your other sessions were signed out."
    );
  }

  function downloadCodes() {
    const text =
      `SecureLens recovery codes for ${user?.username}\n` +
      "Each code works once.\n\n" +
      recoveryCodes.join("\n") +
      "\n";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    link.download = "securelens-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const errorLine = error && (
    <p className="assessment-message" role="alert">
      {error}
    </p>
  );

  const passwordField = (
    <div className="form-group">
      <label htmlFor="mfa-password">Current password</label>
      <input
        id="mfa-password"
        type="password"
        autoComplete="current-password"
        maxLength={256}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        autoFocus
      />
    </div>
  );

  const codeField = (label, hint) => (
    <div className="form-group">
      <label htmlFor="mfa-code">{label}</label>
      <input
        id="mfa-code"
        type="text"
        autoComplete="one-time-code"
        maxLength={32}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        required
        autoFocus={step === "scan"}
      />
      {hint && <small>{hint}</small>}
    </div>
  );

  const cancel = (
    <button
      type="button"
      className="secondary-button"
      onClick={() => {
        setSetup(null);
        go("idle");
      }}
    >
      Cancel
    </button>
  );

  if (step === "password") {
    return (
      <form className="user-form" onSubmit={handleStart}>
        <h3>Turn on two-step verification</h3>
        <p>
          You will need an authenticator app such as Google
          Authenticator, Microsoft Authenticator, or 1Password.
        </p>
        {errorLine}
        {passwordField}
        <div className="control-modal-actions">
          {cancel}
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Checking..." : "Continue"}
          </button>
        </div>
      </form>
    );
  }

  if (step === "scan" && setup) {
    return (
      <form className="user-form" onSubmit={handleEnable}>
        <h3>Scan with your authenticator app</h3>
        <img
          className="mfa-qr"
          src={setup.qr}
          alt="QR code to add SecureLens to an authenticator app"
          width={200}
          height={200}
        />
        <p>
          Can't scan? Enter this key instead:
          <code className="mfa-secret">{setup.secret.match(/.{1,4}/g).join(" ")}</code>
        </p>
        {errorLine}
        {codeField("6-digit code from the app", "This confirms the app is set up correctly.")}
        <div className="control-modal-actions">
          {cancel}
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Checking..." : "Turn On"}
          </button>
        </div>
      </form>
    );
  }

  if (step === "codes") {
    return (
      <div className="user-form">
        <h3>Save your recovery codes</h3>
        <p>
          If you lose your phone, sign in with one of these instead of
          an app code. Each works once. They will not be shown again.
        </p>
        <ul className="mfa-codes">
          {recoveryCodes.map((item) => (
            <li key={item}>
              <code>{item}</code>
            </li>
          ))}
        </ul>
        <div className="control-modal-actions">
          <button type="button" className="secondary-button" onClick={downloadCodes}>
            Download
          </button>
          <button type="button" className="primary-button" onClick={finishCodes}>
            I Saved Them
          </button>
        </div>
      </div>
    );
  }

  if (step === "disable" || step === "renew") {
    const disabling = step === "disable";
    return (
      <form className="user-form" onSubmit={disabling ? handleDisable : handleRenew}>
        <h3>{disabling ? "Turn off two-step verification" : "Create new recovery codes"}</h3>
        {!disabling && <p>Your current recovery codes will stop working.</p>}
        {errorLine}
        {passwordField}
        {codeField("App code or recovery code")}
        <div className="control-modal-actions">
          {cancel}
          <button
            type="submit"
            className={disabling ? "danger-button" : "primary-button"}
            disabled={busy}
          >
            {busy ? "Saving..." : disabling ? "Turn Off" : "Create Codes"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mfa-settings">
      <div className="sidebar-detail">
        <span>Two-step verification</span>
        <strong>{enabled ? "On" : "Off"}</strong>
      </div>

      {message && (
        <p className="assessment-message" role="status">
          {message}
        </p>
      )}

      {enabled ? (
        <div className="control-actions">
          <button type="button" className="secondary-button" onClick={() => go("renew")}>
            New Recovery Codes
          </button>
          <button type="button" className="secondary-button" onClick={() => go("disable")}>
            Turn Off
          </button>
        </div>
      ) : (
        <button type="button" className="secondary-button" onClick={() => go("password")}>
          Turn On Two-Step Verification
        </button>
      )}
    </div>
  );
}
