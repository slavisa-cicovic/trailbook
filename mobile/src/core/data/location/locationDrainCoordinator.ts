export class LocationDrainCoordinator {
  private activeDrain: Promise<number> | null = null;

  run(drain: () => Promise<number>): Promise<number> {
    if (this.activeDrain) return this.activeDrain;

    let drainPromise: Promise<number>;
    drainPromise = drain().finally(() => {
      if (this.activeDrain === drainPromise) this.activeDrain = null;
    });
    this.activeDrain = drainPromise;
    return drainPromise;
  }
}

export class LocationWriteBarrier {
  private readonly activeWrites = new Set<Promise<unknown>>();

  run<T>(write: () => Promise<T>): Promise<T> {
    let writePromise: Promise<T>;
    writePromise = write().finally(() => this.activeWrites.delete(writePromise));
    this.activeWrites.add(writePromise);
    return writePromise;
  }

  async waitForIdle(): Promise<void> {
    while (this.activeWrites.size > 0) {
      await Promise.all([...this.activeWrites]);
    }
  }
}
