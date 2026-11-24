/** Tiny event bus: a push arrived while the app is open, so the screen that cares can refresh once. */
type PushData = Record<string, unknown>;
const listeners = new Set<(d: PushData) => void>();

export function emitPush(d: PushData): void {
  listeners.forEach(fn => { try { fn(d); } catch { /* ignore */ } });
}

/** Returns an unsubscribe function. */
export function onPush(fn: (d: PushData) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
