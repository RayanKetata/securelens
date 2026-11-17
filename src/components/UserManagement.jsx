import { useEffect, useState } from "react";

import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
} from "../services/api";
import { useAuth } from "../context/auth-context";

const ROLE_HELP = {
  admin: "Manages users and can change everything.",
  analyst: "Assesses controls, uploads evidence, runs AI review.",
  viewer: "Read-only access.",
};

const EMPTY_FORM = { username: "", password: "", role: "analyst" };

/* Admin-only list of accounts with create, role change, reset, delete. */
export default function UserManagement() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [resetPassword, setResetPassword] = useState("");

  async function refresh() {
    try {
      setUsers(await getUsers());
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    getUsers()
      .then((rows) => {
        if (active) setUsers(rows);
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function run(action, success) {
    setBusy(true);
    setMessage("");

    try {
      await action();
      setMessage(success);
      await refresh();
      return true;
    } catch (error) {
      setMessage(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();

    const created = await run(
      () => createUser(form),
      `Created ${form.username} (${form.role}).`
    );

    if (created) setForm(EMPTY_FORM);
  }

  function handleRoleChange(user, role) {
    run(
      () => updateUser(user.id, { role }),
      `${user.username} is now ${role}.`
    );
  }

  async function handleReset(event) {
    event.preventDefault();

    const done = await run(
      () => updateUser(resetFor.id, { password: resetPassword }),
      `Password reset for ${resetFor.username}. Their existing sessions were signed out.`
    );

    if (done) {
      setResetFor(null);
      setResetPassword("");
    }
  }

  function handleDisableMfa(user) {
    const confirmed = window.confirm(
      `Turn off two-step verification for "${user.username}"?\n\n` +
      "Do this only after confirming who they are, for example when they lost their phone. " +
      "They will be signed out and can then sign in with only their password."
    );

    if (confirmed) {
      run(
        () => updateUser(user.id, { disableMfa: true }),
        `Two-step verification turned off for ${user.username}.`
      );
    }
  }

  function handleDelete(user) {
    const confirmed = window.confirm(
      `Delete the account "${user.username}"?\n\nTheir name stays on past assessment history.`
    );

    if (confirmed) {
      run(() => deleteUser(user.id), `Deleted ${user.username}.`);
    }
  }

  return (
    <section className="assessment-card">
      <div className="section-title-row">
        <h2>Users</h2>
      </div>

      <p>
        {Object.entries(ROLE_HELP)
          .map(([role, help]) => `${role}: ${help}`)
          .join(" ")}
      </p>

      {message && (
        <p className="assessment-message" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p>Loading users...</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Two-step</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.username}
                    {user.id === currentUser?.id && " (you)"}
                  </td>

                  <td>
                    <select
                      aria-label={`Role for ${user.username}`}
                      value={user.role}
                      disabled={busy}
                      onChange={(event) =>
                        handleRoleChange(user, event.target.value)
                      }
                    >
                      <option value="admin">admin</option>
                      <option value="analyst">analyst</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </td>

                  <td>{user.mfaEnabled ? "On" : "Off"}</td>

                  <td>
                    <div className="control-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => {
                          setResetFor(user);
                          setResetPassword("");
                        }}
                      >
                        Reset Password
                      </button>

                      {user.mfaEnabled && user.id !== currentUser?.id && (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => handleDisableMfa(user)}
                        >
                          Turn Off Two-Step
                        </button>
                      )}

                      {user.id !== currentUser?.id && (
                        <button
                          type="button"
                          className="danger-button"
                          disabled={busy}
                          onClick={() => handleDelete(user)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resetFor && (
        <form className="user-form" onSubmit={handleReset}>
          <h3>Reset password for {resetFor.username}</h3>

          <div className="form-group">
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              required
            />
            <small>At least 12 characters.</small>
          </div>

          <div className="control-modal-actions">
            <button type="button" className="secondary-button" onClick={() => setResetFor(null)}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              Reset Password
            </button>
          </div>
        </form>
      )}

      <form className="user-form" onSubmit={handleCreate}>
        <h3>Add a user</h3>

        <div className="form-group">
          <label htmlFor="new-username">Username</label>
          <input
            id="new-username"
            type="text"
            autoComplete="off"
            maxLength={80}
            pattern="[A-Za-z0-9._\-]{3,80}"
            title="3–80 characters: letters, numbers, dot, dash, underscore"
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="new-password">Initial password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
          <small>At least 12 characters. Share it with the user privately.</small>
        </div>

        <div className="form-group">
          <label htmlFor="new-role">Role</label>
          <select
            id="new-role"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
          >
            <option value="analyst">analyst</option>
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
        </div>

        <button type="submit" className="primary-button" disabled={busy}>
          Add User
        </button>
      </form>
    </section>
  );
}
