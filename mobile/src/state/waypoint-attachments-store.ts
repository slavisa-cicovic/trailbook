import { useSyncExternalStore } from "react";

import type { WaypointAttachment } from "../domain/trips";
import {
  loadWaypointAttachments,
  saveWaypointAttachments,
} from "../storage/waypoint-attachments-storage";

interface WaypointAttachmentsState {
  hydrated: boolean;
  attachments: WaypointAttachment[];
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: WaypointAttachmentsState = {
  hydrated: false,
  attachments: [],
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(
  updater:
    | WaypointAttachmentsState
    | ((currentState: WaypointAttachmentsState) => WaypointAttachmentsState),
) {
  state = typeof updater === "function" ? updater(state) : updater;
  emitChange();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useWaypointAttachmentsStore<T>(
  selector: (snapshot: WaypointAttachmentsState) => T,
): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export async function hydrateWaypointAttachmentsStore(): Promise<void> {
  const attachments = await loadWaypointAttachments();

  setState({
    hydrated: true,
    attachments,
  });
}

export async function setWaypointAttachments(
  attachments: WaypointAttachment[],
): Promise<void> {
  setState((currentState) => ({
    ...currentState,
    attachments,
  }));

  await saveWaypointAttachments(attachments);
}
