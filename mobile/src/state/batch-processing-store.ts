import { create } from "zustand";

const useBatchProcessingStore = create<{ processing: boolean }>(() => ({ processing: false }));

export function setBatchProcessing(value: boolean): void {
  if (useBatchProcessingStore.getState().processing !== value) {
    useBatchProcessingStore.setState({ processing: value });
  }
}

export function useBatchProcessing(): boolean {
  return useBatchProcessingStore((s) => s.processing);
}
