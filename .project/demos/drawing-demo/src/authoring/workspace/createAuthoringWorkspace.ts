import { asDocumentId, createId, type CanvasId, type DocumentId, type GraphId } from '../ids';
import { createCommandRunner } from '../commands/dispatch';
import { createDocumentStore } from '../document/documentStore';
import {
  createEmptyDocumentWorkingCopy,
  firstCanvasIdForGraph,
  firstGraphId,
} from '../document';
import { createHistoryStore } from '../history';
import { createSessionStore, setViewFocus } from '../session/sessionStore';
import {
  applyFocusTransition,
  captureSurfaceResume,
  surfaceResumeKey,
  writeSurfaceResumeEntry,
} from '../session/surfaceResume';
import type { DocumentState, ViewFocus } from '../types';
import { createLocalStoragePersistenceAdapter } from './persistence';
import { syncDocumentSettingsIdentity } from './settingsAdapter';
import {
  deserializeDocument,
  documentPersistenceKey,
  serializeDocument,
} from './serialize';
import type {
  AuthoringWorkspace,
  CreateAuthoringWorkspaceOptions,
} from './types';
import {
  createDocumentSyncController,
  type DocumentSyncController,
} from '../../session/documentSync';

const DEFAULT_LOCAL_DOCUMENT_ID = asDocumentId('local-dev');

export function createAuthoringWorkspace(
  options: CreateAuthoringWorkspaceOptions = {},
): AuthoringWorkspace {
  const persistence =
    options.persistence ?? createLocalStoragePersistenceAdapter();
  let indexerUrl: string | null = options.indexerUrl ?? null;
  let booted = false;
  let documentSync: DocumentSyncController | null = null;

  const documentStore = createDocumentStore();
  const sessionStore = createSessionStore();
  const historyStore = createHistoryStore();

  const workspaceRef: { current: AuthoringWorkspace | null } = { current: null };

  const runner = createCommandRunner({
    documentStore,
    sessionStore,
    historyStore,
    onActivity: (event) => {
      documentSync?.handleActivity(event);
    },
  });

  function resolveDocumentId(documentId?: DocumentId): DocumentId {
    return documentId ?? DEFAULT_LOCAL_DOCUMENT_ID;
  }

  function buildEmptyDocument(documentId: DocumentId): DocumentState {
    return createEmptyDocumentWorkingCopy({
      documentId,
      indexerUrl,
    });
  }

  function ensureDocumentSync(): DocumentSyncController {
    if (!documentSync) {
      documentSync = createDocumentSyncController(workspaceRef.current!, {
        getIndexerUrl: () => indexerUrl,
      });
    }
    return documentSync;
  }

  function transitionFocus(next: ViewFocus): void {
    const session = sessionStore.getState();
    const fromKey = surfaceResumeKey(session.viewFocus);
    const toKey = surfaceResumeKey(next);
    if (fromKey !== null && fromKey === toKey) {
      return;
    }

    if (fromKey !== null) {
      writeSurfaceResumeEntry(sessionStore, fromKey, captureSurfaceResume(session));
    }

    const document = documentStore.getState();
    const snapshot =
      toKey !== null ? sessionStore.getState().surfaceResume[toKey] ?? null : null;
    applyFocusTransition(sessionStore, document, next, snapshot);
  }

  function focusDocumentRoot(): void {
    const state = documentStore.getState();
    const graphId = firstGraphId(state) ?? null;
    const canvasId =
      graphId !== null ? firstCanvasIdForGraph(state, graphId) ?? null : null;

    transitionFocus({
      documentId: state.documentId,
      graphId,
      canvasId,
    });
  }

  function focusGraph(graphId: GraphId): void {
    const state = documentStore.getState();
    if (!state.graphs[graphId]) {
      return;
    }

    transitionFocus({
      documentId: state.documentId,
      graphId,
      canvasId: null,
    });
  }

  function focusCanvas(canvasId: CanvasId): void {
    const state = documentStore.getState();
    const canvas = state.canvases[canvasId];
    if (!canvas) {
      return;
    }

    transitionFocus({
      documentId: state.documentId,
      graphId: canvas.graphId,
      canvasId,
    });
  }

  function setViewFocusOnSession(focus: ViewFocus): void {
    setViewFocus(sessionStore, focus);
  }

  function getFocusedCanvasId(): CanvasId | null {
    return sessionStore.getState().viewFocus.canvasId;
  }

  async function syncSettingsIdentity(): Promise<void> {
    await syncDocumentSettingsIdentity(workspace);
  }

  async function ensureBooted(sessionIndexerUrl?: string | null): Promise<void> {
    if (sessionIndexerUrl !== undefined) {
      indexerUrl = sessionIndexerUrl;
      documentStore.setState((draft) => {
        draft.indexerUrl = sessionIndexerUrl;
      });
    }

    if (!booted) {
      await bootLocalDocument();
      booted = true;
    }

    ensureDocumentSync();
    if (indexerUrl) {
      await documentSync?.hydrateFromIndexer();
      await syncSettingsIdentity();
      return;
    }

    await syncSettingsIdentity();
  }

  async function bootLocalDocument(
    documentId?: DocumentId,
  ): Promise<void> {
    const resolvedId = resolveDocumentId(documentId);
    runner.loadDocument(buildEmptyDocument(resolvedId));
    booted = true;
    focusDocumentRoot();
    await syncSettingsIdentity();
  }

  async function newDocument(documentId?: DocumentId): Promise<void> {
    const resolvedId = documentId ?? asDocumentId(createId('doc'));
    runner.loadDocument(buildEmptyDocument(resolvedId));
    focusDocumentRoot();
    await syncSettingsIdentity();
    if (indexerUrl) {
      await documentSync?.flush();
      await documentSync?.hydrateFromIndexer();
    }
  }

  async function openDocument(state: DocumentState): Promise<void> {
    runner.loadDocument({
      ...state,
      indexerUrl: state.indexerUrl ?? indexerUrl,
    });
    focusDocumentRoot();
    await syncSettingsIdentity();
  }

  async function saveDocument(): Promise<string> {
    const state = documentStore.getState();
    const blob = serializeDocument(state);
    const key = documentPersistenceKey(state.indexerUrl, state.documentId);
    await persistence.save(key, blob);
    await documentSync?.flush();
    return blob;
  }

  async function loadSavedDocument(documentId: DocumentId): Promise<boolean> {
    if (indexerUrl) {
      runner.loadDocument(buildEmptyDocument(documentId));
      focusDocumentRoot();
      await documentSync?.hydrateFromIndexer();
      await syncSettingsIdentity();
      return true;
    }

    const key = documentPersistenceKey(indexerUrl, documentId);
    const raw = await persistence.load(key);
    if (!raw) {
      return false;
    }

    const state = deserializeDocument(raw);
    await openDocument(state);
    return true;
  }

  const workspace: AuthoringWorkspace = {
    documentStore,
    sessionStore,
    runner,
    historyStore,
    ensureBooted,
    bootLocalDocument,
    newDocument,
    openDocument,
    saveDocument,
    loadSavedDocument,
    focusDocumentRoot,
    focusGraph,
    focusCanvas,
    setViewFocus: setViewFocusOnSession,
    getFocusedCanvasId,
    syncSettingsIdentity,
    getDocumentSync: () => documentSync,
  };

  workspaceRef.current = workspace;

  // Seeded document already has a graph/canvas; keep session focus aligned so
  // Workspace highlight works before async ensureBooted completes.
  focusDocumentRoot();

  return workspace;
}
