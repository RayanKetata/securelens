import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getAuthStatus,
  getCurrentUser,
  getSessionToken,
  login as loginApi,
  logout as logoutApi,
  onUnauthorized,
  setSessionToken,
  setupFirstAdmin,
} from "../services/api";

import { AuthContext } from "./auth-context";

/*
 * status:
 *   "loading"        checking the saved session / server
 *   "setup"          no users exist yet; show first-admin setup
 *   "signed-out"     show the sign-in page
 *   "signed-in"      user is available
 *   "unavailable"    the API could not be reached
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function resolveSession() {
      try {
        if (getSessionToken()) {
          try {
            const currentUser = await getCurrentUser();
            if (active) {
              setUser(currentUser);
              setStatus("signed-in");
            }
            return;
          } catch {
            // Saved token is no longer valid; fall through to sign-in.
            setSessionToken(null);
          }
        }

        const { setupRequired } = await getAuthStatus();

        if (active) {
          setStatus(setupRequired ? "setup" : "signed-out");
        }
      } catch {
        if (active) setStatus("unavailable");
      }
    }

    resolveSession();

    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(
    () =>
      onUnauthorized((message) => {
        setUser(null);
        setStatus("signed-out");
        setNotice(message || "Your session ended. Sign in again.");
      }),
    []
  );

  const finishSignIn = useCallback((result) => {
    setSessionToken(result.token);
    setUser(result.user);
    setNotice("");
    setStatus("signed-in");
  }, []);

  const signIn = useCallback(
    async (username, password) => {
      finishSignIn(await loginApi(username, password));
    },
    [finishSignIn]
  );

  const completeSetup = useCallback(
    async (username, password) => {
      finishSignIn(await setupFirstAdmin(username, password));
    },
    [finishSignIn]
  );

  const signOut = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      // Sign out locally even if the server is unreachable.
    }

    setSessionToken(null);
    setUser(null);
    setNotice("You have been signed out.");
    setStatus("signed-out");
  }, []);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((current) => current + 1);
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      notice,
      isAdmin: user?.role === "admin",
      canEdit: user?.role === "admin" || user?.role === "analyst",
      signIn,
      completeSetup,
      signOut,
      retry,
    }),
    [status, user, notice, signIn, completeSetup, signOut, retry]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
