import { applyPatches } from 'immer';
import type { DocumentStore } from '../document/documentStore';
import type { HistoryEntry } from './types';

export function applyForwardPatches(
  store: DocumentStore,
  entry: HistoryEntry,
): void {
  store.setState(applyPatches(store.getState(), entry.patches), true);
}

export function applyInversePatches(
  store: DocumentStore,
  entry: HistoryEntry,
): void {
  store.setState(applyPatches(store.getState(), entry.inversePatches), true);
}
