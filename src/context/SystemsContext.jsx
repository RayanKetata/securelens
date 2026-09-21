import {
  useEffect,
  useState,
} from "react";

import {
  getSystems,
  getSystem as getSystemApi,
  createSystem as createSystemApi,
  deleteSystem as deleteSystemApi,
  addControls as addControlsApi,
  updateControlAssessment as updateControlAssessmentApi,
  deleteControl as deleteControlApi,
  uploadEvidence as uploadEvidenceApi,
  deleteEvidence as deleteEvidenceApi,
  getEvidenceDownloadUrl,
} from "../services/api";


import { SystemsContext } from "./systems-context";


// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

function prepareEvidence(evidence) {
  return {
    ...evidence,

    downloadUrl:
      getEvidenceDownloadUrl(evidence.id),
  };
}


function prepareControl(control) {
  return {
    ...control,

    analystNotes:
      control.analystNotes ?? "",

    findings:
      control.findings ?? "",

    evidence:
      (control.evidence ?? []).map(
        prepareEvidence
      ),
  };
}


function prepareSystem(system) {
  const controls =
    (system.controls ?? []).map(
      prepareControl
    );

  const evidenceCount =
    controls.reduce(
      (total, control) =>
        total +
        (control.evidence?.length || 0),
      0
    );

  return {
    ...system,
    controls,
    evidenceCount,
  };
}


// ---------------------------------------------------------
// PROVIDER
// ---------------------------------------------------------

export function SystemsProvider({ children }) {
  const [systems, setSystems] =
    useState([]);

  const [
    loadingSystems,
    setLoadingSystems,
  ] = useState(true);

  const [
    systemsError,
    setSystemsError,
  ] = useState(null);


  // -------------------------------------------------------
  // LOAD ALL SYSTEMS
  // -------------------------------------------------------

  async function loadSystems() {
    try {
      setLoadingSystems(true);
      setSystemsError(null);

      const data =
        await getSystems();

      setSystems(
        data.map(prepareSystem)
      );
    } catch (error) {
      console.error(
        "Failed to load systems:",
        error
      );

      setSystemsError(
        error.message
      );
    } finally {
      setLoadingSystems(false);
    }
  }


  useEffect(() => {
    let active = true;
    getSystems().then((data) => {
      if (active) setSystems(data.map(prepareSystem));
    }).catch((error) => {
      if (active) setSystemsError(error.message);
    }).finally(() => {
      if (active) setLoadingSystems(false);
    });
    return () => { active = false; };
  }, []);


  // -------------------------------------------------------
  // REFRESH ONE SYSTEM
  // -------------------------------------------------------

  async function refreshSystem(systemId) {
    try {
      setSystemsError(null);

      const serverSystem =
        await getSystemApi(systemId);

      const preparedSystem =
        prepareSystem(serverSystem);

      setSystems(
        (currentSystems) => {
          const exists =
            currentSystems.some(
              (system) =>
                String(system.id) ===
                String(systemId)
            );

          if (!exists) {
            return [
              ...currentSystems,
              preparedSystem,
            ];
          }

          return currentSystems.map(
            (system) =>
              String(system.id) ===
              String(systemId)
                ? preparedSystem
                : system
          );
        }
      );

      return preparedSystem;
    } catch (error) {
      console.error(
        "Failed to refresh system:",
        error
      );

      setSystemsError(
        error.message
      );

      return null;
    }
  }


  // -------------------------------------------------------
  // CREATE SYSTEM
  // -------------------------------------------------------

  async function addSystem(system) {
    try {
      setSystemsError(null);

      const createdSystem =
        await createSystemApi(system);

      const preparedSystem =
        prepareSystem(createdSystem);

      setSystems(
        (currentSystems) => [
          ...currentSystems,
          preparedSystem,
        ]
      );

      return preparedSystem;
    } catch (error) {
      console.error(
        "Failed to create system:",
        error
      );

      setSystemsError(
        error.message
      );

      return null;
    }
  }


  // -------------------------------------------------------
  // DELETE SYSTEM
  // -------------------------------------------------------

  async function removeSystem(systemId) {
    try {
      setSystemsError(null);

      await deleteSystemApi(
        systemId
      );

      setSystems(
        (currentSystems) =>
          currentSystems.filter(
            (system) =>
              String(system.id) !==
              String(systemId)
          )
      );

      return true;
    } catch (error) {
      console.error(
        "Failed to delete system:",
        error
      );

      setSystemsError(
        error.message
      );

      return false;
    }
  }


  // -------------------------------------------------------
  // ADD CONTROLS
  // -------------------------------------------------------

  async function addControlsToSystem(
    systemId,
    newControls
  ) {
    try {
      setSystemsError(null);

      const createdControls =
        await addControlsApi(
          systemId,
          newControls
        );

      await refreshSystem(
        systemId
      );

      return createdControls;
    } catch (error) {
      console.error(
        "Failed to add controls:",
        error
      );

      setSystemsError(
        error.message
      );

      return null;
    }
  }


  // -------------------------------------------------------
  // UPDATE ASSESSMENT
  // -------------------------------------------------------

  async function updateControlAssessment(
    systemId,
    controlCode,
    assessment
  ) {
    try {
      setSystemsError(null);

      const updatedControl =
        await updateControlAssessmentApi(
          systemId,
          controlCode,
          assessment
        );

      await refreshSystem(
        systemId
      );

      return updatedControl;
    } catch (error) {
      console.error(
        "Failed to save assessment:",
        error
      );

      setSystemsError(
        error.message
      );

      return null;
    }
  }


  // -------------------------------------------------------
  // REMOVE CONTROL
  // -------------------------------------------------------

  async function removeControlFromSystem(
    systemId,
    controlCode
  ) {
    try {
      setSystemsError(null);

      await deleteControlApi(
        systemId,
        controlCode
      );

      await refreshSystem(
        systemId
      );

      return true;
    } catch (error) {
      console.error(
        "Failed to remove control:",
        error
      );

      setSystemsError(
        error.message
      );

      return false;
    }
  }


  // -------------------------------------------------------
  // UPLOAD EVIDENCE
  // NOW SAVED TO BACKEND
  // -------------------------------------------------------

  async function addEvidenceToControl(
    systemId,
    controlCode,
    file
  ) {
    try {
      setSystemsError(null);

      const uploadedEvidence =
        await uploadEvidenceApi(
          systemId,
          controlCode,
          file
        );

      await refreshSystem(
        systemId
      );

      return prepareEvidence(
        uploadedEvidence
      );
    } catch (error) {
      console.error(
        "Failed to upload evidence:",
        error
      );

      setSystemsError(
        error.message
      );

      return null;
    }
  }


  // -------------------------------------------------------
  // REMOVE EVIDENCE
  // -------------------------------------------------------

  async function removeEvidenceFromControl(
    systemId,
    controlCode,
    evidenceId
  ) {
    try {
      setSystemsError(null);

      await deleteEvidenceApi(
        evidenceId
      );

      await refreshSystem(
        systemId
      );

      return true;
    } catch (error) {
      console.error(
        "Failed to delete evidence:",
        error
      );

      setSystemsError(
        error.message
      );

      return false;
    }
  }

  async function deleteSystem(systemId) {
  try {
    await deleteSystemApi(systemId);

    setSystems((currentSystems) =>
      currentSystems.filter(
        (system) =>
          String(system.id) !==
          String(systemId)
      )
    );

    return true;
  } catch (error) {
    console.error(
      "Failed to delete system:",
      error
    );

    throw error;
  }
}
  return (
    <SystemsContext.Provider
      value={{
        systems,

        loadingSystems,
        systemsError,

        loadSystems,
        refreshSystem,

        addSystem,
        removeSystem,

        addControlsToSystem,
        updateControlAssessment,
        removeControlFromSystem,

        addEvidenceToControl,
        removeEvidenceFromControl,
        deleteSystem,
      }}
    >
      {children}
    </SystemsContext.Provider>
  );
}

