import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthContext } from "../context/auth-context";
import Login from "./Login";

function mfaError(message) {
  const error = new Error(message);
  error.mfaRequired = true;
  return error;
}

function renderLogin(auth, props = {}) {
  const value = { signIn: vi.fn(), completeSetup: vi.fn(), notice: "", ...auth };
  render(
    <AuthContext.Provider value={value}>
      <Login {...props} />
    </AuthContext.Provider>
  );
  return value;
}

async function fillCredentials(user) {
  await user.type(screen.getByLabelText("Username"), "analyst");
  await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
}

describe("Login", () => {
  it("signs in with a username and password", async () => {
    const user = userEvent.setup();
    const auth = renderLogin();
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(auth.signIn).toHaveBeenCalledWith("analyst", "correct-horse-battery", undefined);
  });

  it("shows the server's error message", async () => {
    const user = userEvent.setup();
    renderLogin({ signIn: vi.fn().mockRejectedValue(new Error("Incorrect username or password.")) });
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect username or password.");
  });

  it("asks for an authenticator code when MFA is on, then sends it", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn()
      .mockRejectedValueOnce(mfaError("Enter the code from your authenticator app."))
      .mockRejectedValueOnce(mfaError("Incorrect or expired authentication code."))
      .mockResolvedValueOnce(undefined);
    renderLogin({ signIn, notice: "You have been signed out." });
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    // The first prompt is not shown as an error, and the old notice is hidden.
    expect(await screen.findByRole("heading", { name: "Two-step verification" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("You have been signed out.")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Authentication code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect or expired");
    expect(screen.getByLabelText("Authentication code")).toHaveValue("");

    await user.type(screen.getByLabelText("Authentication code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(signIn).toHaveBeenLastCalledWith("analyst", "correct-horse-battery", "123456");
  });

  it("goes back to the password step and clears the password", async () => {
    const user = userEvent.setup();
    renderLogin({ signIn: vi.fn().mockRejectedValue(mfaError("Enter the code.")) });
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    await user.click(await screen.findByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Username")).toHaveValue("analyst");
  });

  it("checks that setup passwords match before creating the admin", async () => {
    const user = userEvent.setup();
    const auth = renderLogin({}, { setup: true });
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "first-password-123");
    await user.type(screen.getByLabelText("Confirm password"), "other-password-123");
    await user.click(screen.getByRole("button", { name: "Create Admin Account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("do not match");
    expect(auth.completeSetup).not.toHaveBeenCalled();
  });
});
