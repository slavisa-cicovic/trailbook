import { useSyncExternalStore } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();
let processing = false;

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function setBatchProcessing(value: boolean): void {
  if (processing !== value) {
    processing = value;
    notify();
  }
}

export function useBatchProcessing(): boolean {
  return useSyncExternalStore(subscribe, () => processing);
}
