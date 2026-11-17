const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000";


// =========================================================
// SESSION TOKEN
// Kept in sessionStorage: it is cleared when the browser tab
// closes, which limits how long a stolen token stays useful.
// =========================================================

const TOKEN_KEY = "securelens-session";

let sessionToken = null;

try {
  sessionToken = sessionStorage.getItem(TOKEN_KEY);
} catch {
  sessionToken = null;
}

const unauthorizedListeners = new Set();

export function getSessionToken() {
  return sessionToken;
}

export function setSessionToken(token) {
  sessionToken = token || null;

  try {
    if (sessionToken) {
      sessionStorage.setItem(TOKEN_KEY, sessionToken);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Storage unavailable; the token still works for this page load.
  }
}

// Called when the server rejects the session (expired or revoked).
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function authHeaders() {
  return sessionToken
    ? { Authorization: `Bearer ${sessionToken}` }
    : {};
}

async function readErrorMessage(response) {
  let errorMessage =
    `Request failed with status ${response.status}`;

  try {
    const errorData =
      await response.json();

    if (
      typeof errorData.detail ===
      "string"
    ) {
      errorMessage =
        errorData.detail;
    } else if (Array.isArray(errorData.detail)) {
      // FastAPI validation errors: list of { loc, msg }.
      errorMessage = errorData.detail
        .map((item) => {
          const field = item.loc?.[item.loc.length - 1];
          return field ? `${field}: ${item.msg}` : item.msg;
        })
        .join("; ");
    }
  } catch {
    // Ignore JSON parsing errors.
  }

  return errorMessage;
}

async function request(
  endpoint,
  options = {}
) {
  const url =
    `${API_BASE_URL}${endpoint}`;

  const isFormData =
    options.body instanceof FormData;

  const headers = {
    ...(isFormData
      ? {}
      : {
          "Content-Type":
            "application/json",
        }),
    ...authHeaders(),
    ...(options.headers || {}),
  };

  const response = await fetch(
    url,
    {
      ...options,
      headers,
    }
  );

  if (!response.ok) {
    const errorBody = await response
      .clone()
      .json()
      .catch(() => null);

    const errorMessage =
      await readErrorMessage(response);

    if (
      response.status === 401 &&
      sessionToken &&
      !options.skipUnauthorizedHandler
    ) {
      setSessionToken(null);
      unauthorizedListeners.forEach((listener) => listener(errorMessage));
    }

    const error = new Error(errorMessage);
    error.status = response.status;
    // The password was right and a second factor is needed.
    error.mfaRequired = Boolean(errorBody?.mfaRequired);
    throw error;
  }

  if (response.status === 204) {
    return true;
  }

  const text =
    await response.text();

  if (!text) {
    return true;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}


// =========================================================
// SYSTEMS
// =========================================================

export function getHealth() {
  return request(
    "/health"
  );
}


// =========================================================
// AUTHENTICATION AND USERS
// =========================================================

export function getAuthStatus() {
  return request("/auth/status");
}

export function login(username, password, code) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password, code: code || null }),
    skipUnauthorizedHandler: true,
  });
}

export function setupFirstAdmin(username, password) {
  return request("/auth/setup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return request("/auth/logout", {
    method: "POST",
    skipUnauthorizedHandler: true,
  });
}

export function getCurrentUser() {
  return request("/auth/me");
}

export function changePassword(currentPassword, newPassword) {
  return request("/auth/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function startMfaSetup(currentPassword) {
  return request("/auth/mfa/setup", {
    method: "POST",
    body: JSON.stringify({ currentPassword }),
  });
}

export function enableMfa(code) {
  return request("/auth/mfa/enable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function disableMfa(currentPassword, code) {
  return request("/auth/mfa/disable", {
    method: "POST",
    body: JSON.stringify({ currentPassword, code }),
  });
}

export function regenerateRecoveryCodes(currentPassword, code) {
  return request("/auth/mfa/recovery-codes", {
    method: "POST",
    body: JSON.stringify({ currentPassword, code }),
  });
}

export function getActivity({ before, category, limit = 50 } = {}, signal) {
  const params = new URLSearchParams({ limit: String(limit) });

  if (before) params.set("before", String(before));
  if (category) params.set("category", category);

  return request(`/activity?${params}`, { signal });
}

/*
 * Download the activity log as CSV. The endpoint needs the session
 * token, so the file is fetched here and saved from a blob URL.
 */
export async function downloadActivityCsv({ category } = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  const query = params.toString();

  const response = await fetch(
    `${API_BASE_URL}/activity/export${query ? `?${query}` : ""}`,
    { headers: authHeaders() }
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const disposition = response.headers.get("Content-Disposition") || "";
  const filename =
    disposition.match(/filename="([^"]+)"/)?.[1] || "securelens-activity.csv";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await response.blob());
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function getUsers() {
  return request("/users");
}

export function createUser(user) {
  return request("/users", {
    method: "POST",
    body: JSON.stringify(user),
  });
}

export function updateUser(userId, changes) {
  return request(`/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(changes),
  });
}

export function deleteUser(userId) {
  return request(`/users/${userId}`, {
    method: "DELETE",
  });
}


export function getSystems() {
  return request(
    "/systems"
  );
}


export function getSystem(
  systemId
) {
  return request(
    `/systems/${systemId}`
  );
}


export function createSystem(
  systemData
) {
  return request(
    "/systems",
    {
      method: "POST",
      body: JSON.stringify(
        systemData
      ),
    }
  );
}


export function updateSystem(
  systemId,
  systemData
) {
  return request(
    `/systems/${systemId}`,
    {
      method: "PUT",
      body: JSON.stringify(
        systemData
      ),
    }
  );
}


export function deleteSystem(
  systemId
) {
  return request(
    `/systems/${systemId}`,
    {
      method: "DELETE",
    }
  );
}


// =========================================================
// CONTROLS
// =========================================================

export function getControls(
  systemId
) {
  return request(
    `/systems/${systemId}/controls`
  );
}


export function addControls(
  systemId,
  controls
) {
  return request(
    `/systems/${systemId}/controls`,
    {
      method: "POST",
      body: JSON.stringify(
        controls
      ),
    }
  );
}


export function updateControlAssessment(
  systemId,
  controlCode,
  assessmentData
) {
  return request(
    `/systems/${systemId}/controls/${encodeURIComponent(
      controlCode
    )}`,
    {
      method: "PUT",
      body: JSON.stringify(
        assessmentData
      ),
    }
  );
}


export function getControlHistory(
  systemId,
  controlCode,
  signal
) {
  return request(
    `/systems/${systemId}/controls/${encodeURIComponent(
      controlCode
    )}/history`,
    { signal }
  );
}


export function deleteControl(
  systemId,
  controlCode
) {
  return request(
    `/systems/${systemId}/controls/${encodeURIComponent(
      controlCode
    )}`,
    {
      method: "DELETE",
    }
  );
}


// =========================================================
// EVIDENCE
// =========================================================

export function uploadEvidence(
  systemId,
  controlCode,
  file
) {
  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  return request(
    `/systems/${systemId}/controls/${encodeURIComponent(
      controlCode
    )}/evidence`,
    {
      method: "POST",
      body: formData,
    }
  );
}


export function getControlEvidence(
  systemId,
  controlCode
) {
  return request(
    `/systems/${systemId}/controls/${encodeURIComponent(
      controlCode
    )}/evidence`
  );
}


export function getEvidenceText(
  evidenceId
) {
  return request(
    `/evidence/${evidenceId}/text`
  );
}


// Search the extracted text and filenames of all evidence.
export function searchEvidence({ q, systemId, limit = 20 }, signal) {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (systemId) params.set("systemId", String(systemId));
  return request(`/evidence/search?${params}`, { signal });
}


// Run text extraction (including OCR) again for an uploaded file.
export function reextractEvidence(evidenceId) {
  return request(
    `/evidence/${evidenceId}/extract`,
    { method: "POST" }
  );
}


export function deleteEvidence(
  evidenceId
) {
  return request(
    `/evidence/${evidenceId}`,
    {
      method: "DELETE",
    }
  );
}


export function getEvidenceDownloadUrl(
  evidenceId
) {
  return (
    `${API_BASE_URL}` +
    `/evidence/${evidenceId}/download`
  );
}


/*
 * Open an evidence file in a new tab. The download endpoint needs
 * the session token, which a plain link cannot send, so the file is
 * fetched here and shown from a temporary blob URL.
 *
 * Call this directly from a click handler: the tab is opened before
 * any await so popup blockers allow it.
 */
export async function openEvidenceFile(
  evidenceId
) {
  const viewer = window.open("", "_blank");

  if (viewer) {
    viewer.opener = null;
    viewer.document.title = "Loading evidence...";
  }

  try {
    const response = await fetch(
      getEvidenceDownloadUrl(evidenceId),
      { headers: authHeaders() }
    );

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    // Only show types the backend accepts; anything else downloads.
    const reported = (response.headers.get("Content-Type") || "").split(";")[0];
    const type = ["application/pdf", "text/plain", "image/png", "image/jpeg"].includes(reported)
      ? reported
      : "application/octet-stream";

    const blob = new Blob([await response.blob()], { type });
    const url = URL.createObjectURL(blob);

    if (viewer) {
      viewer.location.href = url;
    } else {
      window.location.assign(url);
    }

    // Give the new tab time to load before releasing the blob.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    viewer?.close();
    throw error;
  }
}


// =========================================================
// AI
// =========================================================

export function analyzeControlEvidence(
  systemId,
  controlCode,
  signal
) {
  return request(
    `/systems/${systemId}/controls/${encodeURIComponent(
      controlCode
    )}/analyze`,
    {
      method: "POST",
      signal,
    }
  );
}


export {
  API_BASE_URL,
};
