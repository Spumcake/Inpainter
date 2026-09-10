import type { Patch } from 'immer';

export type HistoryEntryOrigin = 'local' | 'remote';

export type HistoryEntry = {
  /** Stable client-local identity; never reused. Position keys off this, not array index. */
  id: string;
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  /**
   * Indexer revision after this entry (`seq` on wire). Null until autosave confirms
   * a local entry; set synchronously for remote / hydrated entries.
   */
  seq: number | null;
  origin: HistoryEntryOrigin;
};

export type HistoryState = {
  entries: HistoryEntry[];
  /** Id of the last applied entry, or null for Launch (before first Command). */
  positionId: string | null;
};
