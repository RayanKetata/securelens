const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000";


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
      }
    } catch {
      // Ignore JSON parsing errors.
    }

    throw new Error(
      errorMessage
    );
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
