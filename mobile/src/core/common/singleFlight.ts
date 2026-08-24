export class SingleFlight<Key, Value> {
  private readonly active = new Map<Key, Promise<Value>>();

  run(key: Key, operation: () => Promise<Value>): Promise<Value> {
    const existing = this.active.get(key);
    if (existing) return existing;

    const promise = operation().finally(() => {
      if (this.active.get(key) === promise) this.active.delete(key);
    });
    this.active.set(key, promise);
    return promise;
  }
}
