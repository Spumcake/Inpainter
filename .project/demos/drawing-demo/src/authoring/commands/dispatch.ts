import { produceWithPatches, applyPatches, type Patch } from 'immer';
import { replaceDocument, type DocumentStore } from '../document/documentStore';
import {
  firstCanvasIdForGraph,
  firstGraphId,
} from '../document/selectors';
import {
  applyForwardPatches,
  applyInversePatches,
  appendLocalTruncating,
  clearHistoryStore,
  entryAtIndex,
  indexOfPosition,
  insertRemoteOrdered,
  isAtTip,
  newHistoryEntryId,
  reconcileSeq,
  replaceAll,
  setPositionByIndex,
  type HistoryStore,
} from '../history';
import type { HistoryEntry } from '../history/types';
import { setViewFocus, type SessionStore } from '../session/sessionStore';
import type { DocumentState } from '../types';
import type { ActivityEvent, Command, DispatchOptions } from './types';

export type RecordRemoteEntryInput = {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  seq: number;
};

export type CommandRunner = {
  dispatch: (command: Command, options?: DispatchOptions) => void;
  undo: () => void;
  redo: () => void;
  jump: (index: number) => void;
  clearHistory: () => void;
  loadDocument: (state: DocumentState) => void;
  /** Apply remote patches without touching local History. */
  applyRemotePatches: (patches: Patch[]) => void;
  isAtHistoryTip: () => boolean;
  recordRemoteEntry: (input: RecordRemoteEntryInput) => void;
  reconcileLocalEntry: (id: string, seq: number) => void;
  replaceHistory: (entries: HistoryEntry[]) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getHistoryPointer: () => number;
  getHistoryLength: () => number;
};

export type CommandRunnerOptions = {
  documentStore: DocumentStore;
  sessionStore: SessionStore;
  historyStore: HistoryStore;
  onActivity?: (event: ActivityEvent) => void;
};

type StepOptions = {
  emitActivity?: boolean;
};

/**
 * Undo/jump can remove the focused Canvas (or its Sketch Data). Session focus is
 * not in History — re-point at a renderable surface so CanvasHost does not blank.
 */
function healViewFocusIfNeeded(
  documentStore: DocumentStore,
  sessionStore: SessionStore,
): void {
  const doc = documentStore.getState();
  const focus = sessionStore.getState().viewFocus;

  if (focus.canvasId != null) {
    if (doc.canvases[focus.canvasId] && doc.sketches[focus.canvasId]) {
      return;
    }
  } else if (focus.graphId != null && doc.graphs[focus.graphId]) {
    return;
  }

  const graphId = firstGraphId(doc) ?? null;
  let canvasId = graphId != null ? firstCanvasIdForGraph(doc, graphId) ?? null : null;
  if (canvasId != null && !doc.sketches[canvasId]) {
    canvasId = null;
    if (graphId != null) {
      for (const id of doc.canvasOrderByGraph[graphId] ?? []) {
        if (doc.canvases[id] && doc.sketches[id]) {
          canvasId = id;
          break;
        }
      }
    }
  }

  setViewFocus(sessionStore, {
    documentId: doc.documentId,
    graphId,
    canvasId,
  });
}

export function createCommandRunner(
  options: CommandRunnerOptions,
): CommandRunner {
  const { documentStore, sessionStore, historyStore, onActivity } = options;

  function canUndo(): boolean {
    return indexOfPosition(historyStore.getState()) >= 0;
  }

  function canRedo(): boolean {
    const state = historyStore.getState();
    const pointer = indexOfPosition(state);
    return pointer < state.entries.length - 1;
  }

  function isAtHistoryTip(): boolean {
    return isAtTip(historyStore.getState());
  }

  function clearHistory(): void {
    clearHistoryStore(historyStore);
  }

  function loadDocument(state: DocumentState): void {
    replaceDocument(documentStore, state);
    clearHistory();
  }

  function applyRemotePatches(patches: Patch[]): void {
    if (patches.length === 0) {
      return;
    }
    documentStore.setState(applyPatches(documentStore.getState(), patches), true);
  }

  function dispatch(command: Command, dispatchOptions?: DispatchOptions): void {
    const undoable = dispatchOptions?.undoable ?? true;
    const base = documentStore.getState();
    const [next, patches, inversePatches] = produceWithPatches(
      base,
      command.apply,
    );

    if (patches.length === 0) {
      return;
    }

    documentStore.setState(next, true);

    let entryId: string | undefined;
    if (undoable) {
      const entry: HistoryEntry = {
        id: newHistoryEntryId(),
        label: command.label,
        patches,
        inversePatches,
        seq: null,
        origin: 'local',
      };
      appendLocalTruncating(historyStore, entry);
      entryId = entry.id;
    }

    onActivity?.({
      type: 'command',
      label: command.label,
      patches,
      inversePatches,
      entryId,
    });
  }

  function undoOne(stepOptions?: StepOptions): HistoryEntry {
    const emitActivity = stepOptions?.emitActivity ?? true;
    const state = historyStore.getState();
    const pointer = indexOfPosition(state);
    if (pointer < 0) {
      throw new Error('Nothing to undo');
    }

    const entry = entryAtIndex(state, pointer);
    if (!entry) {
      throw new Error('Nothing to undo');
    }
    if (entry.inversePatches.length === 0) {
      throw new Error(
        `Cannot undo "${entry.label}": empty inversePatches`,
      );
    }

    try {
      applyInversePatches(documentStore, entry);
    } catch (err) {
      throw err instanceof Error
        ? err
        : new Error(`Cannot undo "${entry.label}"`);
    }

    setPositionByIndex(historyStore, pointer - 1);
    healViewFocusIfNeeded(documentStore, sessionStore);
    if (emitActivity) {
      onActivity?.({
        type: 'undo',
        label: `Undo ${entry.label}`,
        patches: entry.inversePatches,
        inversePatches: entry.patches,
        entryId: entry.id,
      });
    }
    return entry;
  }

  function redoOne(stepOptions?: StepOptions): HistoryEntry {
    const emitActivity = stepOptions?.emitActivity ?? true;
    const state = historyStore.getState();
    const pointer = indexOfPosition(state);
    const nextIndex = pointer + 1;
    if (nextIndex >= state.entries.length) {
      throw new Error('Nothing to redo');
    }

    const entry = entryAtIndex(state, nextIndex);
    if (!entry) {
      throw new Error('Nothing to redo');
    }
    if (entry.patches.length === 0) {
      throw new Error(`Cannot redo "${entry.label}": empty patches`);
    }

    try {
      applyForwardPatches(documentStore, entry);
    } catch (err) {
      throw err instanceof Error
        ? err
        : new Error(`Cannot redo "${entry.label}"`);
    }

    setPositionByIndex(historyStore, nextIndex);
    healViewFocusIfNeeded(documentStore, sessionStore);
    if (emitActivity) {
      onActivity?.({
        type: 'redo',
        label: `Redo ${entry.label}`,
        patches: entry.patches,
        inversePatches: entry.inversePatches,
        entryId: entry.id,
      });
    }
    return entry;
  }

  function undo(): void {
    if (!canUndo()) {
      return;
    }
    undoOne();
  }

  function redo(): void {
    if (!canRedo()) {
      return;
    }
    redoOne();
  }

  function jump(index: number): void {
    const length = historyStore.getState().entries.length;
    if (index < -1 || index >= length) {
      throw new RangeError(`History index out of range: ${index}`);
    }

    const docBefore = documentStore.getState();
    const positionIdBefore = historyStore.getState().positionId;
    const startPointer = indexOfPosition(historyStore.getState());
    if (startPointer === index) {
      return;
    }

    const applied: HistoryEntry[] = [];
    const goingBack = startPointer > index;

    try {
      while (indexOfPosition(historyStore.getState()) > index) {
        applied.push(undoOne({ emitActivity: false }));
      }
      while (indexOfPosition(historyStore.getState()) < index) {
        applied.push(redoOne({ emitActivity: false }));
      }
    } catch (err) {
      documentStore.setState(docBefore, true);
      historyStore.setState((state) => {
        state.positionId = positionIdBefore;
      });
      healViewFocusIfNeeded(documentStore, sessionStore);
      throw err;
    }

    const netPatches: Patch[] = [];
    const netInverse: Patch[] = [];
    if (goingBack) {
      for (const entry of applied) {
        netPatches.push(...entry.inversePatches);
      }
      for (let i = applied.length - 1; i >= 0; i -= 1) {
        netInverse.push(...applied[i]!.patches);
      }
    } else {
      for (const entry of applied) {
        netPatches.push(...entry.patches);
      }
      for (let i = applied.length - 1; i >= 0; i -= 1) {
        netInverse.push(...applied[i]!.inversePatches);
      }
    }

    if (netPatches.length > 0) {
      onActivity?.({
        type: goingBack ? 'undo' : 'redo',
        label: goingBack ? 'Jump undo' : 'Jump redo',
        patches: netPatches,
        inversePatches: netInverse,
      });
    }
  }

  function recordRemoteEntry(input: RecordRemoteEntryInput): void {
    if (!isAtHistoryTip()) {
      throw new Error(
        'recordRemoteEntry requires history tip; defer via remote queue',
      );
    }
    if (input.patches.length === 0) {
      return;
    }

    applyRemotePatches(input.patches);
    const entry: HistoryEntry = {
      id: newHistoryEntryId(),
      label: input.label,
      patches: input.patches,
      inversePatches: input.inversePatches,
      seq: input.seq,
      origin: 'remote',
    };
    insertRemoteOrdered(historyStore, entry);
    healViewFocusIfNeeded(documentStore, sessionStore);
  }

  function reconcileLocalEntry(id: string, seq: number): void {
    reconcileSeq(historyStore, id, seq);
  }

  function replaceHistory(entries: HistoryEntry[]): void {
    replaceAll(historyStore, entries);
    healViewFocusIfNeeded(documentStore, sessionStore);
  }

  return {
    dispatch,
    undo,
    redo,
    jump,
    clearHistory,
    loadDocument,
    applyRemotePatches,
    isAtHistoryTip,
    recordRemoteEntry,
    reconcileLocalEntry,
    replaceHistory,
    canUndo,
    canRedo,
    getHistoryPointer: () => indexOfPosition(historyStore.getState()),
    getHistoryLength: () => historyStore.getState().entries.length,
  };
}
