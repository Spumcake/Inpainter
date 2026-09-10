import { createAuthoringStore, type AuthoringStore } from '../store/createAuthoringStore';
import type { HistoryEntry, HistoryState } from './types';

export type HistoryStore = AuthoringStore<HistoryState>;

export function createHistoryStore(
  initial?: Partial<HistoryState>,
): HistoryStore {
  return createAuthoringStore<HistoryState>(() => ({
    entries: initial?.entries ?? [],
    positionId: initial?.positionId ?? null,
  }));
}

export function clearHistoryStore(store: HistoryStore): void {
  store.setState((state) => {
    state.entries = [];
    state.positionId = null;
  });
}

export function indexOfPosition(state: HistoryState): number {
  if (state.positionId == null) {
    return -1;
  }
  return state.entries.findIndex((entry) => entry.id === state.positionId);
}

export function isAtTip(state: HistoryState): boolean {
  if (state.entries.length === 0) {
    return state.positionId == null;
  }
  const last = state.entries[state.entries.length - 1];
  return last != null && state.positionId === last.id;
}

export function entryAtIndex(
  state: HistoryState,
  index: number,
): HistoryEntry | undefined {
  if (index < 0 || index >= state.entries.length) {
    return undefined;
  }
  return state.entries[index];
}

/** Drop redo tail past current position, then append. Local Commands only. */
export function appendLocalTruncating(
  store: HistoryStore,
  entry: HistoryEntry,
): void {
  store.setState((state) => {
    const pointer = indexOfPosition(state);
    state.entries = state.entries.slice(0, pointer + 1);
    state.entries.push(entry);
    state.positionId = entry.id;
  });
}

/**
 * Insert a remote entry ordered by seq (entries without seq append at end).
 * Advances position only when currently at tip.
 */
export function insertRemoteOrdered(
  store: HistoryStore,
  entry: HistoryEntry,
): void {
  store.setState((state) => {
    const atTip = isAtTip(state);
    let insertAt = state.entries.length;
    if (typeof entry.seq === 'number') {
      for (let i = 0; i < state.entries.length; i += 1) {
        const existing = state.entries[i];
        if (existing == null) continue;
        if (existing.seq != null && existing.seq === entry.seq) {
          // Already present (e.g. self-echo / reconcile race) — skip insert.
          return;
        }
        if (existing.seq != null && existing.seq > entry.seq) {
          insertAt = i;
          break;
        }
      }
    }
    state.entries.splice(insertAt, 0, entry);
    if (atTip) {
      state.positionId = entry.id;
    }
  });
}

export function reconcileSeq(
  store: HistoryStore,
  id: string,
  seq: number,
): void {
  store.setState((state) => {
    const entry = state.entries.find((item) => item.id === id);
    if (entry) {
      entry.seq = seq;
    }
  });
}

export function replaceAll(
  store: HistoryStore,
  entries: HistoryEntry[],
): void {
  store.setState((state) => {
    state.entries = entries;
    const last = entries[entries.length - 1];
    state.positionId = last?.id ?? null;
  });
}

export function setPositionByIndex(
  store: HistoryStore,
  index: number,
): void {
  store.setState((state) => {
    if (index < 0) {
      state.positionId = null;
      return;
    }
    const entry = state.entries[index];
    state.positionId = entry?.id ?? null;
  });
}

export function newHistoryEntryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `hist-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
