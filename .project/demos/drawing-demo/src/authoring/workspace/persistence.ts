import type { PersistenceAdapter } from './types';

export function createMemoryPersistenceAdapter(): PersistenceAdapter {
  const store = new Map<string, string>();

  return {
    save(key, value) {
      store.set(key, value);
    },
    load(key) {
      return store.get(key) ?? null;
    },
  };
}

export function createLocalStoragePersistenceAdapter(): PersistenceAdapter {
  const storage =
    typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? globalThis.localStorage
      : null;

  return {
    save(key, value) {
      storage?.setItem(key, value);
    },
    load(key) {
      return storage?.getItem(key) ?? null;
    },
  };
}
