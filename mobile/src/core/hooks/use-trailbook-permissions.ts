import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import type { TrailbookPermissionKey, TrailbookPermissionStatus } from "../../services/permissions/permission-manager.service";
import {
  formatMissingTrailbookPermissions,
  getTrailbookPermissionStatus,
  requestTrailbookPermissions,
} from "../../services/permissions/permission-manager.service";
import { useSessionStore } from "../../state/session-store";

export interface TrailbookPermissionsResult {
  backgroundLocationPermissionGranted: boolean | null;
  backgroundRecordingSupported: boolean | null;
  locationPermissionGranted: boolean | null;
  missingPermissionsText: string;
  missingRequired: TrailbookPermissionKey[] | null;
  permissionsReady: boolean;
  refreshStatus: () => Promise<TrailbookPermissionStatus>;
  requestPermissions: () => Promise<void>;
}

export function useTrailbookPermissions(): TrailbookPermissionsResult {
  const userId = useSessionStore((s) => s.identitySession?.userId ?? null);

  const [status, setStatus] = useState<TrailbookPermissionStatus | null>(null);
  const promptedRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    promptedRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (!userId || promptedRef.current) {
      return;
    }

    let active = true;
    promptedRef.current = true;

    async function checkAndRequestPermissions() {
      const current = await getTrailbookPermissionStatus();

      if (!active) {
        return;
      }

      setStatus(current);

      if (!current.allRequiredGranted) {
        const requested = await requestTrailbookPermissions();

        if (active) {
          setStatus(requested);
        }
      }
    }

    void checkAndRequestPermissions();

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    let active = true;

    async function refreshPermissions() {
      const next = await getTrailbookPermissionStatus();

      if (active) {
        setStatus(next);
      }
    }

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        void refreshPermissions();
      }
    });

    void refreshPermissions();

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  async function refreshStatus(): Promise<TrailbookPermissionStatus> {
    const next = await getTrailbookPermissionStatus();
    setStatus(next);
    return next;
  }

  async function requestPermissions() {
    if (runningRef.current) {
      return;
    }

    runningRef.current = true;

    try {
      setStatus(await requestTrailbookPermissions());
    } finally {
      runningRef.current = false;
    }
  }

  return {
    backgroundLocationPermissionGranted: status?.backgroundLocationGranted ?? null,
    backgroundRecordingSupported: status?.backgroundLocationSupported ?? null,
    locationPermissionGranted: status?.foregroundLocationGranted ?? null,
    missingPermissionsText: formatMissingTrailbookPermissions(status),
    missingRequired: status?.missingRequired ?? null,
    permissionsReady: status?.allRequiredGranted === true,
    refreshStatus,
    requestPermissions,
  };
}
