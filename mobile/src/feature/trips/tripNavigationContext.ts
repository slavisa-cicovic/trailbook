const contexts = new Map<string, string[]>();

export function saveTripNavigationContext(tripClientIds: string[]): string {
  const id = `trip-context-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  contexts.set(id, tripClientIds);
  return id;
}

export function getTripNavigationContext(id: string | null | undefined): string[] | null {
  if (!id) return null;
  return contexts.get(id) ?? null;
}
