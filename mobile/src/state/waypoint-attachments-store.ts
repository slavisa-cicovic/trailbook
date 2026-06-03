import { create } from "zustand";

import type { WaypointAttachment } from "../domain/trips";
import {
  loadWaypointAttachments,
  saveWaypointAttachments,
} from "../storage/waypoint-attachments-storage";

interface WaypointAttachmentsState {
  hydrated: boolean;
  attachments: WaypointAttachment[];
}

export const useWaypointAttachmentsStore = create<WaypointAttachmentsState>(() => ({
  hydrated: false,
  attachments: [],
}));

export async function hydrateWaypointAttachmentsStore(): Promise<void> {
  const attachments = await loadWaypointAttachments();
  useWaypointAttachmentsStore.setState({ hydrated: true, attachments });
}

export async function setWaypointAttachments(attachments: WaypointAttachment[]): Promise<void> {
  const previousAttachments = useWaypointAttachmentsStore.getState().attachments;
  useWaypointAttachmentsStore.setState({ attachments });
  await saveWaypointAttachments(attachments, previousAttachments);
}
