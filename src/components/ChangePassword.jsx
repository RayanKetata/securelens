import { useState } from "react";

import { changePassword } from "../services/api";

const EMPTY = { current: "", next: "", confirm: "" };

/* Lets any signed-in user change their own password. */
export default function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function update(field) {
    return (event) => setForm({ ...form, [field]: event.target.value });
  }

  function close() {
    setOpen(false);
    setForm(EMPTY);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (form.next !== form.confirm) {
      setError("The new passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      await changePassword(form.current, form.next);
      close();
      setSuccess(
        "Password changed. Your other sessions were signed out."
      );
    } catch (failure) {
      setError(failure.message || "The password could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <>
        {success && (
          <p className="assessment-message" role="status">
            {success}
          </p>
        )}

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setSuccess("");
            setOpen(true);
          }}
        >
          Change Password
        </button>
      </>
    );
  }

  return (
    <form className="user-form" onSubmit={handleSubmit}>
      <h3>Change password</h3>

      {error && (
        <p className="assessment-message" role="alert">
          {error}
        </p>
      )}

      <div className="form-group">
        <label htmlFor="current-password">Current password</label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          maxLength={256}
          value={form.current}
          onChange={update("current")}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="changed-password">New password</label>
        <input
          id="changed-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          value={form.next}
          onChange={update("next")}
          required
        />
        <small>At least 12 characters.</small>
      </div>

      <div className="form-group">
        <label htmlFor="confirm-changed-password">Confirm new password</label>
        <input
          id="confirm-changed-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          value={form.confirm}
          onChange={update("confirm")}
          required
        />
      </div>

      <div className="control-modal-actions">
        <button type="button" className="secondary-button" onClick={close}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? "Saving..." : "Save Password"}
        </button>
      </div>
    </form>
  );
}
