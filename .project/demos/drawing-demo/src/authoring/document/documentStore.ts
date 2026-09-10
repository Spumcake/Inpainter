import { asDocumentId } from '../ids';
import { createAuthoringStore, type AuthoringStore } from '../store/createAuthoringStore';
import type { DocumentState } from '../types';
import { createEmptyDocumentWorkingCopy } from './factory';

export type DocumentStore = AuthoringStore<DocumentState>;

export function createDocumentStore(initial?: DocumentState): DocumentStore {
  const seed =
    initial ??
    createEmptyDocumentWorkingCopy({
      documentId: asDocumentId('local-dev'),
    });

  return createAuthoringStore<DocumentState>(() => seed);
}

export function replaceDocument(
  store: DocumentStore,
  next: DocumentState,
): void {
  store.setState(next, true);
}
