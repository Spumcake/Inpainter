import { useEffect, useState } from 'react';
import type { SettingsCatalog, SettingValue } from '../types';
import { extractDefaults } from '../utils/extractDefaults';
import {
  DOCUMENT_PREFERENCES_CATALOG_ID,
  scheduleDocumentSettingsSave,
} from '../documentSettingsBridge';

type CatalogOverrides = Record<string, SettingValue>;
type CatalogValues = Record<string, SettingValue>;

const EMPTY: CatalogValues = Object.freeze({});

export function mergeSettings(
  factory: CatalogValues,
  overrides: CatalogOverrides,
): CatalogValues {
  return { ...factory, ...overrides };
}

class SettingsStore {
  private overrides = new Map<string, CatalogOverrides>();
  private snapshots = new Map<string, CatalogValues>();
  private catalogs = new Map<string, SettingsCatalog>();
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private rebuildSnapshot(catalogId: string): CatalogValues {
    const catalog = this.catalogs.get(catalogId);
    if (!catalog) {
      this.snapshots.delete(catalogId);
      return EMPTY;
    }
    const snapshot = mergeSettings(
      extractDefaults(catalog),
      this.overrides.get(catalogId) ?? {},
    );
    this.snapshots.set(catalogId, snapshot);
    return snapshot;
  }

  getSnapshot(catalogId: string): CatalogValues {
    return this.snapshots.get(catalogId) ?? EMPTY;
  }

  getOverrides(catalogId: string): CatalogOverrides {
    return { ...(this.overrides.get(catalogId) ?? {}) };
  }

  hydrate(catalogId: string, catalog: SettingsCatalog): CatalogValues {
    this.catalogs.set(catalogId, catalog);
    const existing = this.snapshots.get(catalogId);
    if (existing) return existing;
    return this.rebuildSnapshot(catalogId);
  }

  replaceOverrides(catalogId: string, overrides: CatalogOverrides): CatalogValues {
    if (Object.keys(overrides).length === 0) {
      this.overrides.delete(catalogId);
    } else {
      this.overrides.set(catalogId, { ...overrides });
    }
    const snapshot = this.rebuildSnapshot(catalogId);
    this.emit();
    return snapshot;
  }

  patch(catalogId: string, partial: Record<string, SettingValue>): void {
    const current = this.overrides.get(catalogId) ?? {};
    this.overrides.set(catalogId, { ...current, ...partial });
    const prev = this.snapshots.get(catalogId) ?? {};
    this.snapshots.set(catalogId, { ...prev, ...partial });
    this.emit();

    if (catalogId === DOCUMENT_PREFERENCES_CATALOG_ID) {
      void scheduleDocumentSettingsSave();
    }
  }

  resetKey(catalogId: string, key: string): void {
    const current = this.overrides.get(catalogId);
    if (!current || !(key in current)) return;

    const next = { ...current };
    delete next[key];
    if (Object.keys(next).length === 0) {
      this.overrides.delete(catalogId);
    } else {
      this.overrides.set(catalogId, next);
    }

    this.rebuildSnapshot(catalogId);
    this.emit();

    if (catalogId === DOCUMENT_PREFERENCES_CATALOG_ID) {
      void scheduleDocumentSettingsSave();
    }
  }
}

export const settingsStore = new SettingsStore();

export function useCatalogValues(
  catalogId: string,
  catalog: SettingsCatalog,
): Record<string, SettingValue> {
  const [values, setValues] = useState<CatalogValues>(() =>
    settingsStore.hydrate(catalogId, catalog),
  );

  useEffect(() => {
    setValues(settingsStore.hydrate(catalogId, catalog));
    return settingsStore.subscribe(() => {
      setValues(settingsStore.getSnapshot(catalogId));
    });
  }, [catalogId, catalog]);

  return values;
}
