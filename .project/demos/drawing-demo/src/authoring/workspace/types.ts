import type { CommandRunner } from '../commands/dispatch';
import type { DocumentStore } from '../document/documentStore';
import type { HistoryStore } from '../history/historyStore';
import type { SessionStore } from '../session/sessionStore';
import type { DocumentState, ViewFocus } from '../types';
import type { CanvasId, DocumentId, GraphId } from '../ids';
import type { DocumentSyncController } from '../../session/documentSync';

export type PersistenceAdapter = {
  save(key: string, value: string): void | Promise<void>;
  load(key: string): string | null | Promise<string | null>;
};

export type CreateAuthoringWorkspaceOptions = {
  persistence?: PersistenceAdapter;
  indexerUrl?: string | null;
};

export type AuthoringWorkspace = {
  documentStore: DocumentStore;
  sessionStore: SessionStore;
  runner: CommandRunner;
  historyStore: HistoryStore;
  ensureBooted: (indexerUrl?: string | null) => Promise<void>;
  bootLocalDocument: (documentId?: DocumentId) => Promise<void>;
  newDocument: (documentId?: DocumentId) => Promise<void>;
  openDocument: (state: DocumentState) => Promise<void>;
  saveDocument: () => Promise<string>;
  loadSavedDocument: (documentId: DocumentId) => Promise<boolean>;
  focusDocumentRoot: () => void;
  focusGraph: (graphId: GraphId) => void;
  focusCanvas: (canvasId: CanvasId) => void;
  setViewFocus: (focus: ViewFocus) => void;
  getFocusedCanvasId: () => CanvasId | null;
  syncSettingsIdentity: () => Promise<void>;
  getDocumentSync?: () => DocumentSyncController | null;
};
