export { createAuthoringWorkspace } from './createAuthoringWorkspace';
export {
  createLocalStoragePersistenceAdapter,
  createMemoryPersistenceAdapter,
} from './persistence';
export {
  deserializeDocument,
  documentPersistenceKey,
  serializeDocument,
} from './serialize';
export {
  getSyncedDocumentIdentity,
  syncDocumentSettingsIdentity,
} from './settingsAdapter';
export type {
  AuthoringWorkspace,
  CreateAuthoringWorkspaceOptions,
  PersistenceAdapter,
} from './types';
