/**
 * Indexer-backed Document autosave + fan-out client.
 * Contract: desktop-ui/docs/multi-window.md Shared Document sync;
 * History ownership: desktop-ui/docs/undo-history.md (runner sole mutator).
 */

import type { Patch } from 'immer';
import type { AuthoringWorkspace } from '../authoring/workspace/types';
import type { ActivityEvent } from '../authoring/commands/types';
import type { HistoryEntry } from '../authoring/history/types';
import {
  newHistoryEntryId,
  sanitizeHydratedHistory,
} from '../authoring/history';
import type { DocumentState } from '../authoring/types';
import { deserializeDocument, serializeDocument } from '../authoring/workspace/serialize';
import { asDocumentId } from '../authoring/ids';
import {
  applyDocumentSettingsPayload,
  setDocumentSettingsClientId,
  type DocumentSettingsPayload,
} from '../settings/documentSettingsBridge';

const AUTOSAVE_DEBOUNCE_MS = 250;

export type DocumentSyncController = {
  clientId: string;
  getRevision: () => number;
  isAttached: () => boolean;
  handleActivity: (event: ActivityEvent) => void;
  flush: () => Promise<void>;
  dispose: () => void;
  applyRemoteEvent: (event: DocumentSyncEvent) => void;
  hydrateFromIndexer: () => Promise<void>;
  refreshSharedHistory: () => Promise<void>;
};

export type DocumentSyncEvent = {
  type: string;
  documentId?: string;
  document_id?: string;
  revision?: number;
  patches?: Patch[];
  inversePatches?: Patch[];
  inverse_patches?: Patch[];
  authoring?: unknown;
  settings?: unknown;
  label?: string;
  originClientId?: string;
  origin_client_id?: string;
  appendToHistory?: boolean;
  append_to_history?: boolean;
  entries?: unknown;
};

type QueuedPatch = {
  /** Present only for new undoable Commands — used to attach Indexer `seq`. */
  entryId?: string;
  patches: Patch[];
  inversePatches: Patch[];
  label: string;
  /** False for undo/redo — document sync without Indexer History append. */
  appendToHistory: boolean;
};

function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function eventDocumentId(event: DocumentSyncEvent): string | null {
  return event.documentId ?? event.document_id ?? null;
}

function eventOrigin(event: DocumentSyncEvent): string | null {
  return event.originClientId ?? event.origin_client_id ?? null;
}

function eventInversePatches(event: DocumentSyncEvent): Patch[] {
  return event.inversePatches ?? event.inverse_patches ?? [];
}

function eventAppendToHistory(event: DocumentSyncEvent): boolean {
  if (typeof event.appendToHistory === 'boolean') return event.appendToHistory;
  if (typeof event.append_to_history === 'boolean') return event.append_to_history;
  return true;
}

function mapWireHistoryEntries(
  raw: Array<{
    seq?: number;
    label?: string;
    patches?: Patch[];
    inversePatches?: Patch[];
    inverse_patches?: Patch[];
  }>,
): HistoryEntry[] {
  return raw.map((entry) => ({
    id: newHistoryEntryId(),
    label: typeof entry.label === 'string' ? entry.label : 'Edit',
    patches: Array.isArray(entry.patches) ? entry.patches : [],
    inversePatches: Array.isArray(entry.inversePatches)
      ? entry.inversePatches
      : Array.isArray(entry.inverse_patches)
        ? entry.inverse_patches
        : [],
    seq: typeof entry.seq === 'number' ? entry.seq : null,
    origin: 'remote' as const,
  }));
}

export function createDocumentSyncController(
  workspace: AuthoringWorkspace,
  options: {
    getIndexerUrl: () => string | null;
  },
): DocumentSyncController {
  const clientId = newClientId();
  setDocumentSettingsClientId(clientId);
  let revision = 0;
  let attached = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: QueuedPatch[] = [];
  let remoteQueue: DocumentSyncEvent[] = [];
  let disposed = false;
  let inflight: Promise<void> | null = null;
  let epochPutInflight: Promise<void> | null = null;

  function clearAutosaveQueue(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    queue = [];
  }

  const unsubscribeBusy = workspace.sessionStore.subscribe(() => {
    if (!workspace.sessionStore.getState().interactionBusy) {
      flushRemoteQueue();
    }
  });

  const unsubscribeHistory = workspace.historyStore.subscribe(() => {
    if (
      workspace.runner.isAtHistoryTip() &&
      !workspace.sessionStore.getState().interactionBusy
    ) {
      flushRemoteQueue();
    }
  });

  function indexerBase(): string | null {
    const url = options.getIndexerUrl()?.trim();
    if (!url) return null;
    return url.replace(/\/$/, '');
  }

  function openDocumentId(): string {
    return String(workspace.documentStore.getState().documentId);
  }

  async function putEmptyHistory(documentId: string): Promise<void> {
    const base = indexerBase();
    if (!base) return;
    if (epochPutInflight) {
      await epochPutInflight;
      return;
    }
    epochPutInflight = (async () => {
      const response = await fetch(
        `${base}/documents/${encodeURIComponent(documentId)}/history`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entries: [],
            originClientId: clientId,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`PUT history failed: ${response.status}`);
      }
    })();
    try {
      await epochPutInflight;
    } finally {
      epochPutInflight = null;
    }
  }

  /**
   * Validate hydrated rows against tip authoring. On failure, install empty
   * epoch locally and persist to Indexer so peers do not rehydrate poison.
   */
  async function installSanitizedHistory(
    documentId: string,
    raw: HistoryEntry[],
  ): Promise<void> {
    const authoring = workspace.documentStore.getState();
    const sanitized = sanitizeHydratedHistory(authoring, raw);
    workspace.runner.replaceHistory(sanitized);
    if (raw.length > 0 && sanitized.length === 0) {
      console.error(
        '[documentSync] History epoch recovery: discarding',
        raw.length,
        'invalid or poisoned Indexer entries; tip Document is SoT',
      );
      try {
        await putEmptyHistory(documentId);
      } catch (err) {
        console.error('[documentSync] epoch PUT history failed', err);
      }
    }
  }

  async function fetchSharedHistory(documentId: string): Promise<HistoryEntry[]> {
    const base = indexerBase();
    if (!base) return [];
    const response = await fetch(
      `${base}/documents/${encodeURIComponent(documentId)}/history`,
    );
    if (!response.ok) {
      throw new Error(`GET history failed: ${response.status}`);
    }
    const json = (await response.json()) as {
      entries?: Array<{
        seq?: number;
        label?: string;
        patches?: Patch[];
        inversePatches?: Patch[];
        inverse_patches?: Patch[];
      }>;
    };
    const raw = Array.isArray(json.entries) ? json.entries : [];
    return mapWireHistoryEntries(raw);
  }

  function replaceWorkingCopy(authoring: DocumentState): void {
    workspace.runner.loadDocument(authoring);
    // loadDocument replaces graph/canvas ids; Session viewFocus must track the new Document.
    workspace.focusDocumentRoot();
  }

  async function getDocument(documentId: string): Promise<{
    revision: number;
    authoring: DocumentState;
    settings: Record<string, unknown>;
  } | null> {
    const base = indexerBase();
    if (!base) return null;
    const response = await fetch(`${base}/documents/${encodeURIComponent(documentId)}`);
    if (!response.ok) {
      throw new Error(`GET document failed: ${response.status}`);
    }
    const json = (await response.json()) as {
      revision: number;
      authoring: unknown;
      settings?: Record<string, unknown>;
    };
    const raw = JSON.stringify(json.authoring);
    const authoring = deserializeDocument(raw);
    return {
      revision: json.revision,
      authoring,
      settings: json.settings ?? {},
    };
  }

  async function putDocument(documentId: string, authoring: DocumentState): Promise<number> {
    const base = indexerBase();
    if (!base) return revision;
    const response = await fetch(`${base}/documents/${encodeURIComponent(documentId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authoring: JSON.parse(serializeDocument(authoring)),
        originClientId: clientId,
      }),
    });
    if (!response.ok) {
      throw new Error(`PUT document failed: ${response.status}`);
    }
    const json = (await response.json()) as { revision: number };
    return json.revision;
  }

  /**
   * Post one activity's patches. On 409, replaces working copy + history and
   * returns null so the caller can drop the rest of the batch.
   */
  async function postOnePatch(
    documentId: string,
    baseRevision: number,
    item: QueuedPatch,
  ): Promise<number | null> {
    const base = indexerBase();
    if (!base) return baseRevision;
    const response = await fetch(
      `${base}/documents/${encodeURIComponent(documentId)}/patches`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseRevision,
          patches: item.patches,
          inversePatches: item.inversePatches,
          originClientId: clientId,
          label: item.label,
          appendToHistory: item.appendToHistory,
        }),
      },
    );
    if (response.status === 409) {
      const detail = (await response.json()) as {
        detail?: { current?: { revision: number; authoring: unknown; settings?: unknown } };
      };
      const current = detail.detail?.current;
      if (current?.authoring) {
        const authoring = deserializeDocument(JSON.stringify(current.authoring));
        replaceWorkingCopy(authoring);
        revision = current.revision;
        try {
          const entries = await fetchSharedHistory(documentId);
          await installSanitizedHistory(documentId, entries);
        } catch {
          /* ignore */
        }
        attached = true;
        if (current.settings && typeof current.settings === 'object') {
          void applyDocumentSettingsPayload(current.settings as DocumentSettingsPayload);
        }
        return null;
      }
      throw new Error('revision conflict');
    }
    if (!response.ok) {
      throw new Error(`POST patches failed: ${response.status}`);
    }
    const json = (await response.json()) as { revision: number };
    if (item.entryId && item.appendToHistory) {
      workspace.runner.reconcileLocalEntry(item.entryId, json.revision);
    }
    return json.revision;
  }

  async function refreshSharedHistory(): Promise<void> {
    const base = indexerBase();
    if (!base) return;
    try {
      const documentId = openDocumentId();
      const entries = await fetchSharedHistory(documentId);
      await installSanitizedHistory(documentId, entries);
    } catch (err) {
      console.error('[documentSync] history refresh failed', err);
    }
  }

  async function hydrateFromIndexer(): Promise<void> {
    attached = false;
    clearAutosaveQueue();

    const base = indexerBase();
    if (!base) {
      throw new Error('hydrate failed: no indexer URL');
    }
    const documentId = openDocumentId();
    try {
      const remote = await getDocument(documentId);
      if (!remote) {
        throw new Error('hydrate failed: document missing');
      }

      const isEmpty =
        remote.revision === 0 &&
        Object.keys(remote.authoring.nodes ?? {}).length === 0 &&
        (remote.authoring.graphOrder?.length ?? 0) === 0;

      if (isEmpty) {
        const local = workspace.documentStore.getState();
        const hasLocal =
          Object.keys(local.nodes).length > 0 || local.graphOrder.length > 0;
        if (hasLocal) {
          revision = await putDocument(documentId, local);
          const entries = await fetchSharedHistory(documentId);
          await installSanitizedHistory(documentId, entries);
          attached = true;
          return;
        }
      }

      replaceWorkingCopy({
        ...remote.authoring,
        documentId: asDocumentId(documentId),
        indexerUrl: remote.authoring.indexerUrl ?? base,
      });
      revision = remote.revision;

      const entries = await fetchSharedHistory(documentId);
      await installSanitizedHistory(documentId, entries);

      if (remote.settings && Object.keys(remote.settings).length > 0) {
        await applyDocumentSettingsPayload(remote.settings as DocumentSettingsPayload);
      }
      attached = true;
    } catch (err) {
      attached = false;
      console.error('[documentSync] hydrate failed', err);
      throw err;
    }
  }

  async function hydrateAfterRevisionMismatch(): Promise<void> {
    if (queue.length > 0 || inflight) {
      await flush();
    }
    await hydrateFromIndexer();
  }

  async function flush(): Promise<void> {
    if (disposed) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (queue.length === 0) return;
    if (inflight) {
      await inflight;
      return flush();
    }

    const batch = queue;
    queue = [];
    const documentId = openDocumentId();

    inflight = (async () => {
      let completed = 0;
      try {
        for (let i = 0; i < batch.length; i += 1) {
          const item = batch[i]!;
          const next = await postOnePatch(documentId, revision, item);
          if (next == null) {
            // Conflict recovery already replaced working copy + history.
            queue = [];
            return;
          }
          revision = next;
          completed = i + 1;
        }
      } catch (err) {
        console.error('[documentSync] autosave failed', err);
        queue = batch.slice(completed).concat(queue);
      } finally {
        inflight = null;
      }
    })();
    await inflight;
  }

  function scheduleFlush(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function handleActivity(event: ActivityEvent): void {
    if (!attached) return;
    if (!indexerBase()) return;
    if (event.patches.length === 0) return;
    // Commands, undo, and redo all mutate the working copy and must autosave
    // so peer windows converge. Only new Commands append Indexer History.
    const appendToHistory = event.type === 'command';
    queue.push({
      entryId: appendToHistory ? event.entryId : undefined,
      patches: event.patches,
      inversePatches: event.inversePatches,
      label: event.label,
      appendToHistory,
    });
    scheduleFlush();
  }

  function canApplyRemoteDocumentPatch(): boolean {
    return (
      workspace.runner.isAtHistoryTip() &&
      !workspace.sessionStore.getState().interactionBusy
    );
  }

  function applyRemoteEvent(event: DocumentSyncEvent): void {
    const docId = eventDocumentId(event);
    if (!docId || docId !== openDocumentId()) return;
    if (eventOrigin(event) === clientId) return;

    if (event.type === 'document.patched') {
      if (!canApplyRemoteDocumentPatch()) {
        remoteQueue.push(event);
        return;
      }
    } else if (workspace.sessionStore.getState().interactionBusy) {
      remoteQueue.push(event);
      return;
    }

    applyOneRemote(event);
  }

  function applyOneRemote(event: DocumentSyncEvent): void {
    if (event.type === 'document.settings.patched' && event.settings) {
      void applyDocumentSettingsPayload(event.settings as DocumentSettingsPayload);
      return;
    }

    if (event.type === 'document.history.replaced') {
      const documentId = openDocumentId();
      if (typeof event.revision === 'number') {
        revision = event.revision;
      }
      const raw = Array.isArray(event.entries)
        ? mapWireHistoryEntries(
            event.entries as Array<{
              seq?: number;
              label?: string;
              patches?: Patch[];
              inversePatches?: Patch[];
              inverse_patches?: Patch[];
            }>,
          )
        : [];
      void installSanitizedHistory(documentId, raw);
      return;
    }

    if (event.type === 'document.replaced' && event.authoring) {
      const authoring = deserializeDocument(JSON.stringify(event.authoring));
      replaceWorkingCopy({
        ...authoring,
        indexerUrl: authoring.indexerUrl ?? indexerBase(),
      });
      if (typeof event.revision === 'number') {
        revision = event.revision;
      }
      void fetchSharedHistory(openDocumentId())
        .then((entries) => installSanitizedHistory(openDocumentId(), entries))
        .catch((err) => console.error('[documentSync] history refresh failed', err));
      if (event.settings && typeof event.settings === 'object') {
        void applyDocumentSettingsPayload(event.settings as DocumentSettingsPayload);
      }
      return;
    }

    if (event.type === 'document.patched' && Array.isArray(event.patches)) {
      if (!canApplyRemoteDocumentPatch()) {
        remoteQueue.push(event);
        return;
      }
      if (typeof event.revision === 'number' && event.revision !== revision + 1) {
        void hydrateAfterRevisionMismatch();
        return;
      }
      const seq =
        typeof event.revision === 'number' ? event.revision : revision + 1;
      const appendHistory = eventAppendToHistory(event);
      if (appendHistory) {
        workspace.runner.recordRemoteEntry({
          label: typeof event.label === 'string' ? event.label : 'Edit',
          patches: event.patches,
          inversePatches: eventInversePatches(event),
          seq,
        });
      } else {
        workspace.runner.applyRemotePatches(event.patches);
      }
      if (typeof event.revision === 'number') {
        revision = event.revision;
      } else {
        revision = seq;
      }
    }
  }

  function flushRemoteQueue(): void {
    if (workspace.sessionStore.getState().interactionBusy) return;
    if (remoteQueue.length === 0) return;

    const pending = remoteQueue;
    remoteQueue = [];
    for (const event of pending) {
      if (event.type === 'document.patched' && !workspace.runner.isAtHistoryTip()) {
        remoteQueue.push(event);
        continue;
      }
      applyOneRemote(event);
    }
  }

  function dispose(): void {
    disposed = true;
    attached = false;
    clearAutosaveQueue();
    unsubscribeBusy();
    unsubscribeHistory();
  }

  return {
    clientId,
    getRevision: () => revision,
    isAttached: () => attached,
    handleActivity,
    flush,
    dispose,
    applyRemoteEvent,
    hydrateFromIndexer,
    refreshSharedHistory,
  };
}
