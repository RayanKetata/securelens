import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext } from "../context/auth-context";
import * as api from "../services/api";
import TwoFactorSettings from "./TwoFactorSettings";

vi.mock("../services/api", () => ({
  startMfaSetup: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,AAAA") },
}));

const CODES = ["abcde-fghjk", "mnpqr-stuvw"];

function renderSettings(user) {
  const refreshUser = vi.fn().mockResolvedValue(undefined);
  render(
    <AuthContext.Provider value={{ user, refreshUser }}>
      <TwoFactorSettings />
    </AuthContext.Provider>
  );
  return refreshUser;
}

describe("TwoFactorSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("walks through setup: password, QR code, first code, recovery codes", async () => {
    const user = userEvent.setup();
    api.startMfaSetup.mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
      otpauthUri: "otpauth://totp/SecureLens:admin?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
    });
    api.enableMfa.mockResolvedValue({ recoveryCodes: CODES });
    const refreshUser = renderSettings({ username: "admin", mfaEnabled: false });

    expect(screen.getByText("Off")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn On Two-Step Verification" }));
    await user.type(screen.getByLabelText("Current password"), "my-password-123");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(api.startMfaSetup).toHaveBeenCalledWith("my-password-123");

    expect(await screen.findByAltText(/QR code/)).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();

    await user.type(screen.getByLabelText("6-digit code from the app"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn On" }));
    expect(api.enableMfa).toHaveBeenCalledWith("123456");

    expect(await screen.findByText("abcde-fghjk")).toBeInTheDocument();
    expect(screen.getByText("mnpqr-stuvw")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "I Saved Them" }));
    expect(refreshUser).toHaveBeenCalled();
    expect(screen.queryByText("abcde-fghjk")).not.toBeInTheDocument();
  });

  it("shows a wrong-code error and stays on the scan step", async () => {
    const user = userEvent.setup();
    api.startMfaSetup.mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/x" });
    api.enableMfa.mockRejectedValue(new Error("That code is not right."));
    renderSettings({ username: "admin", mfaEnabled: false });

    await user.click(screen.getByRole("button", { name: "Turn On Two-Step Verification" }));
    await user.type(screen.getByLabelText("Current password"), "my-password-123");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("6-digit code from the app"), "000000");
    await user.click(screen.getByRole("button", { name: "Turn On" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not right.");
    expect(screen.getByAltText(/QR code/)).toBeInTheDocument();
  });

  it("turns MFA off with a password and a code", async () => {
    const user = userEvent.setup();
    api.disableMfa.mockResolvedValue(true);
    const refreshUser = renderSettings({ username: "admin", mfaEnabled: true });

    expect(screen.getByText("On")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn Off" }));
    await user.type(screen.getByLabelText("Current password"), "my-password-123");
    await user.type(screen.getByLabelText("App code or recovery code"), "abcde-fghjk");
    await user.click(screen.getByRole("button", { name: "Turn Off" }));

    expect(api.disableMfa).toHaveBeenCalledWith("my-password-123", "abcde-fghjk");
    expect(refreshUser).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Two-step verification is off.");
  });

  it("cancel returns to the summary without calling the API", async () => {
    const user = userEvent.setup();
    renderSettings({ username: "admin", mfaEnabled: true });
    await user.click(screen.getByRole("button", { name: "New Recovery Codes" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "New Recovery Codes" })).toBeInTheDocument();
    expect(api.regenerateRecoveryCodes).not.toHaveBeenCalled();
  });
});
