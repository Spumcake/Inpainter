import { applyPatches, enablePatches, type Patch } from 'immer';
import type { DocumentState } from '../types';
import type { HistoryEntry } from './types';

enablePatches();

export function isUndoRedoArtifactLabel(label: string): boolean {
  return label.startsWith('Undo ') || label.startsWith('Redo ');
}

/**
 * Dry-run reverse-replay from tip toward Start. Returns false if any step
 * throws, or if an entry has forward patches but empty inverses.
 */
export function canReverseReplay(
  document: DocumentState,
  entries: readonly Pick<HistoryEntry, 'patches' | 'inversePatches'>[],
): boolean {
  let cursor: DocumentState = document;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (!entry) return false;
    if (entry.patches.length > 0 && entry.inversePatches.length === 0) {
      return false;
    }
    if (entry.inversePatches.length === 0) {
      continue;
    }
    try {
      cursor = applyPatches(cursor, entry.inversePatches as Patch[]);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Hydrated Indexer rows are executable only when the full stack reverse-replays
 * from the tip authoring snapshot and contains no undo/redo autosave artifacts.
 * Otherwise return [] (empty epoch at tip).
 */
export function sanitizeHydratedHistory(
  document: DocumentState,
  entries: readonly HistoryEntry[],
): HistoryEntry[] {
  if (entries.length === 0) {
    return [];
  }
  if (entries.some((entry) => isUndoRedoArtifactLabel(entry.label))) {
    return [];
  }
  if (
    entries.some(
      (entry) =>
        entry.patches.length === 0 && entry.inversePatches.length === 0,
    )
  ) {
    return [];
  }
  if (!canReverseReplay(document, entries)) {
    return [];
  }
  return [...entries];
}
