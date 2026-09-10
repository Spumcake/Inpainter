import { invoke } from '@tauri-apps/api/core';
import type { LibraryAsset } from './asset-library/types';
import type { Brush, DocumentPalette } from './palette/types';
import type { EraserTip } from './eraser/types';
import type { ProviderPrefsMap } from './provider-servers/providerPrefsStore';
import type { SettingValue } from './types';
import { isTauri } from '../tauri-env';
import {
  getFactoryPaletteBrushes,
  getFactoryEraserTips,
  getDocumentPreferencesFactory,
} from './factory/loadDocumentPreferencesFactory';
import { brushesMatchFactory } from './utils/paletteFactoryMatch';
import { tipsMatchFactory } from './utils/eraserFactoryMatch';
import { cloneBrushes } from './palette/cloneBrushes';

export const DOCUMENT_PREFERENCES_CATALOG_ID = 'document-preferences';
export const DEFAULT_DOCUMENT_ID = '__default__';
const DOCUMENT_SETTINGS_SCHEMA_VERSION = 1;

export type DocumentSettingsPayload = {
  schemaVersion: number;
  overrides: Record<string, SettingValue>;
  palette?: {
    /** Sparse override of factory template (Preferences). */
    defaultBrushes?: Brush[];
    /**
     * Legacy flat catalog (pre Sketch-owned sets). Read on hydrate for migration only;
     * no longer written.
     */
    palettes?: DocumentPalette[];
  };
  eraser?: {
    /** Sparse override of factory template (Preferences). */
    defaultTips?: EraserTip[];
    /** Named document eraser tips. */
    tips?: EraserTip[];
  };
  providerPrefs?: ProviderPrefsMap;
  assetLibrary?: {
    assets: LibraryAsset[];
  };
};

let warnedBrowserOnly = false;
let currentIndexerUrl: string | null = null;
let currentDocumentId: string = DEFAULT_DOCUMENT_ID;

function coerceSettingValue(value: unknown): SettingValue | null {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
}

function normalizeOverrides(raw: unknown): Record<string, SettingValue> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const next: Record<string, SettingValue> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const coerced = coerceSettingValue(value);
    if (coerced !== null || value === null) {
      next[key] = coerced;
    }
  }
  return next;
}

function normalizeBrush(raw: unknown): Brush | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const id = entry.id;
  const name = entry.name;
  const color = entry.color;
  const size = entry.size;
  const opacity = entry.opacity;
  const smoothing = entry.smoothing;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof color !== 'string' ||
    typeof size !== 'number' ||
    typeof opacity !== 'number' ||
    typeof smoothing !== 'number'
  ) {
    return null;
  }
  return { id, name, color, size, opacity, smoothing };
}

function normalizeBrushList(raw: unknown): Brush[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const brushes: Brush[] = [];
  for (const item of raw) {
    const brush = normalizeBrush(item);
    if (brush) {
      brushes.push(brush);
    }
  }
  return brushes.length > 0 ? brushes : null;
}

/** Document palette slots: brushes and explicit null empties. */
function normalizeSlotList(raw: unknown): Array<Brush | null> | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const slots: Array<Brush | null> = [];
  let filled = 0;
  for (const item of raw) {
    if (item == null) {
      slots.push(null);
      continue;
    }
    const brush = normalizeBrush(item);
    if (brush) {
      slots.push(brush);
      filled += 1;
    }
  }
  return filled > 0 || slots.length > 0 ? slots : null;
}

function normalizeDocumentPalette(raw: unknown): DocumentPalette | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const id = entry.id;
  const name = entry.name;
  if (typeof id !== 'string' || typeof name !== 'string') {
    return null;
  }
  const brushes = normalizeSlotList(entry.brushes);
  if (!brushes || !brushes.some((slot) => slot != null)) {
    return null;
  }
  return { id, name, brushes };
}

function normalizeEraserTip(raw: unknown): EraserTip | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const id = entry.id;
  const name = entry.name;
  const size = entry.size;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof size !== 'number'
  ) {
    return null;
  }
  return { id, name, size };
}

function normalizeTipList(raw: unknown): EraserTip[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const tips: EraserTip[] = [];
  for (const item of raw) {
    const tip = normalizeEraserTip(item);
    if (tip) {
      tips.push(tip);
    }
  }
  return tips.length > 0 ? tips : null;
}

function normalizeDocumentEraserSetTips(raw: unknown): EraserTip[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  return normalizeTipList(entry.tips);
}

export function normalizeEraserPayload(
  raw: unknown,
): NonNullable<DocumentSettingsPayload['eraser']> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const eraser = raw as Record<string, unknown>;

  const defaultTips = normalizeTipList(eraser.defaultTips);

  const tipsDirect = normalizeTipList(eraser.tips);
  if (tipsDirect) {
    return {
      ...(defaultTips ? { defaultTips } : {}),
      tips: tipsDirect,
    };
  }

  // Legacy: flatten named sets into a flat tip list.
  const setsRaw = eraser.sets;
  if (Array.isArray(setsRaw)) {
    const tips: EraserTip[] = [];
    for (const item of setsRaw) {
      const setTips = normalizeDocumentEraserSetTips(item);
      if (setTips) {
        tips.push(...setTips);
      }
    }
    if (tips.length > 0 || defaultTips) {
      return {
        ...(defaultTips ? { defaultTips } : {}),
        ...(tips.length > 0 ? { tips } : {}),
      };
    }
  }

  if (defaultTips) {
    return { defaultTips };
  }

  return undefined;
}

/**
 * Normalize palette payload, migrating legacy `{ brushes }` into
 * `{ defaultBrushes?, palettes: [{ … }] }`.
 */
export function normalizePalettePayload(
  raw: unknown,
): NonNullable<DocumentSettingsPayload['palette']> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const palette = raw as Record<string, unknown>;

  const defaultBrushes = normalizeBrushList(palette.defaultBrushes);

  const palettesRaw = palette.palettes;
  if (Array.isArray(palettesRaw)) {
    const palettes: DocumentPalette[] = [];
    for (const item of palettesRaw) {
      const docPalette = normalizeDocumentPalette(item);
      if (docPalette) {
        palettes.push(docPalette);
      }
    }
    if (palettes.length > 0 || defaultBrushes) {
      return {
        ...(defaultBrushes ? { defaultBrushes } : {}),
        ...(palettes.length > 0 ? { palettes } : {}),
      };
    }
  }

  // Legacy: `{ brushes: Brush[] }` was both Preferences and the only catalog.
  const legacyBrushes = normalizeBrushList(palette.brushes);
  if (legacyBrushes) {
    return {
      ...(brushesMatchFactory(legacyBrushes) ? {} : { defaultBrushes: legacyBrushes }),
      palettes: [
        {
          id: 'palette-migrated-1',
          name: 'Palette 1',
          brushes: cloneBrushes(legacyBrushes),
        },
      ],
    };
  }

  if (defaultBrushes) {
    return { defaultBrushes };
  }

  return undefined;
}

function normalizeContentKind(raw: unknown): LibraryAsset['contents'][number]['kind'] | null {
  if (raw === 'image' || raw === 'lora' || raw === 'other') {
    return raw;
  }
  return null;
}

function normalizeContentItem(raw: unknown): LibraryAsset['contents'][number] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const id = entry.id;
  const name = entry.name;
  const kind = normalizeContentKind(entry.kind);
  if (typeof id !== 'string' || typeof name !== 'string' || !kind) {
    return null;
  }
  const elementsRaw = entry.elements;
  const elements = Array.isArray(elementsRaw)
    ? elementsRaw.filter((item): item is string => typeof item === 'string')
    : [kind];
  return { id, name, kind, elements };
}

function normalizeLibraryAsset(raw: unknown): LibraryAsset | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const id = entry.id;
  const name = entry.name;
  if (typeof id !== 'string' || typeof name !== 'string') {
    return null;
  }
  const contentsRaw = entry.contents;
  const contents: LibraryAsset['contents'] = [];
  if (Array.isArray(contentsRaw)) {
    for (const item of contentsRaw) {
      const content = normalizeContentItem(item);
      if (content) {
        contents.push(content);
      }
    }
  }
  return { id, name, contents };
}

function normalizeAssetLibrary(raw: unknown): LibraryAsset[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return [];
  }
  const library = raw as Record<string, unknown>;
  const assetsRaw = library.assets;
  if (!Array.isArray(assetsRaw)) {
    return [];
  }
  const assets: LibraryAsset[] = [];
  for (const item of assetsRaw) {
    const asset = normalizeLibraryAsset(item);
    if (asset) {
      assets.push(asset);
    }
  }
  return assets;
}

function normalizeProviderPrefs(raw: unknown): ProviderPrefsMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const next: ProviderPrefsMap = {};
  for (const [providerId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const overrides: Record<string, SettingValue> = {};
    for (const [key, settingValue] of Object.entries(value as Record<string, unknown>)) {
      const coerced = coerceSettingValue(settingValue);
      if (coerced !== null || settingValue === null) {
        overrides[key] = coerced;
      }
    }
    if (Object.keys(overrides).length > 0) {
      next[providerId] = overrides;
    }
  }
  return next;
}

export function setDocumentIdentity(
  indexerUrl: string | null,
  documentId: string | null,
): void {
  currentIndexerUrl = indexerUrl;
  currentDocumentId = documentId ?? DEFAULT_DOCUMENT_ID;
}

export function getDocumentIdentity(): {
  indexerUrl: string | null;
  documentId: string;
} {
  return {
    indexerUrl: currentIndexerUrl,
    documentId: currentDocumentId,
  };
}

export async function loadDocumentSettingsFromDisk(
  indexerUrl: string,
  documentId: string,
): Promise<DocumentSettingsPayload> {
  if (!isTauri()) {
    if (!warnedBrowserOnly) {
      console.info('[desktop-ui] document settings persistence requires the Tauri tray app');
      warnedBrowserOnly = true;
    }
    return {
      schemaVersion: DOCUMENT_SETTINGS_SCHEMA_VERSION,
      overrides: {},
    };
  }

  try {
    const payload = await invoke<DocumentSettingsPayload>('load_document_settings', {
      indexerUrl,
      documentId,
    });
    const providerPrefs = normalizeProviderPrefs(payload?.providerPrefs);
    const assetLibrary = normalizeAssetLibrary(payload?.assetLibrary);
    return {
      schemaVersion: payload?.schemaVersion ?? DOCUMENT_SETTINGS_SCHEMA_VERSION,
      overrides: normalizeOverrides(payload?.overrides),
      palette: normalizePalettePayload(payload?.palette),
      eraser: normalizeEraserPayload(payload?.eraser),
      providerPrefs: Object.keys(providerPrefs).length > 0 ? providerPrefs : undefined,
      assetLibrary: assetLibrary.length > 0 ? { assets: assetLibrary } : undefined,
    };
  } catch (err) {
    console.error('[desktop-ui] failed to load document settings', err);
    return {
      schemaVersion: DOCUMENT_SETTINGS_SCHEMA_VERSION,
      overrides: {},
    };
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function writeDocumentSettings(payload: DocumentSettingsPayload): Promise<void> {
  const { indexerUrl, documentId } = getDocumentIdentity();
  if (!indexerUrl) return;

  await putDocumentSettingsToIndexer(indexerUrl, documentId, payload);

  // Tray file remains an optional offline cache.
  if (isTauri()) {
    try {
      await invoke('save_document_settings', {
        indexerUrl,
        documentId,
        payload,
      });
    } catch (err) {
      console.error('[desktop-ui] failed to cache document settings on tray', err);
    }
  }
}

export async function scheduleDocumentSettingsSave(): Promise<void> {
  const { indexerUrl } = getDocumentIdentity();
  if (!indexerUrl) return;

  const { settingsStore } = await import('./store/settingsStore');
  const { defaultPaletteStore } = await import('./palette/defaultPaletteStore');
  const { defaultEraserStore } = await import('./eraser/defaultEraserStore');
  const { documentEraserStore } = await import('./eraser/documentEraserStore');
  const { assetLibraryStore } = await import('./asset-library/assetLibraryStore');
  const { getProviderPrefs, providerPrefsIsEmpty } = await import(
    './provider-servers/providerPrefsStore'
  );

  const overrides = settingsStore.getOverrides(DOCUMENT_PREFERENCES_CATALOG_ID);
  const defaultBrushes = defaultPaletteStore.getBrushes();

  const defaultBrushesOverride = brushesMatchFactory(defaultBrushes)
    ? undefined
    : defaultBrushes.map((brush) => ({ ...brush }));

  const paletteOverride = defaultBrushesOverride
    ? { defaultBrushes: defaultBrushesOverride }
    : undefined;

  const defaultTips = defaultEraserStore.getTips();
  const eraserTips = documentEraserStore.getTips();

  const defaultTipsOverride = tipsMatchFactory(defaultTips)
    ? undefined
    : defaultTips.map((tip) => ({ ...tip }));

  const eraserOverride =
    defaultTipsOverride || eraserTips.length > 0
      ? {
          ...(defaultTipsOverride ? { defaultTips: defaultTipsOverride } : {}),
          ...(eraserTips.length > 0
            ? {
                tips: eraserTips.map((tip) => ({ ...tip })),
              }
            : {}),
        }
      : undefined;

  const assets = assetLibraryStore.getAssets();
  const assetLibraryOverride =
    assets.length > 0 ? { assets: assets.map((asset) => ({ ...asset })) } : undefined;

  const providerPrefs = getProviderPrefs();
  const providerPrefsOverride = providerPrefsIsEmpty() ? undefined : { ...providerPrefs };

  const payload: DocumentSettingsPayload = {
    schemaVersion: DOCUMENT_SETTINGS_SCHEMA_VERSION,
    overrides: { ...overrides },
    ...(paletteOverride ? { palette: paletteOverride } : {}),
    ...(eraserOverride ? { eraser: eraserOverride } : {}),
    ...(providerPrefsOverride ? { providerPrefs: providerPrefsOverride } : {}),
    ...(assetLibraryOverride ? { assetLibrary: assetLibraryOverride } : {}),
  };

  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    saveTimer = null;
    void writeDocumentSettings(payload).catch((err) => {
      console.error('[desktop-ui] failed to save document settings', err);
    });
  }, 250);
}

function applyPaletteHydrate(
  defaultPaletteStore: typeof import('./palette/defaultPaletteStore').defaultPaletteStore,
  palette: DocumentSettingsPayload['palette'] | undefined,
): DocumentPalette[] {
  if (palette?.defaultBrushes && palette.defaultBrushes.length > 0) {
    defaultPaletteStore.replaceAll(palette.defaultBrushes);
  } else {
    defaultPaletteStore.replaceAll(getFactoryPaletteBrushes());
  }
  // Legacy flat catalog — returned for Sketch migration; not kept as a live store.
  return palette?.palettes?.map((entry) => ({
    ...entry,
    brushes: entry.brushes.map((brush) => (brush ? { ...brush } : null)),
  })) ?? [];
}

function applyEraserHydrate(
  defaultEraserStore: typeof import('./eraser/defaultEraserStore').defaultEraserStore,
  documentEraserStore: typeof import('./eraser/documentEraserStore').documentEraserStore,
  eraser: DocumentSettingsPayload['eraser'] | undefined,
): void {
  if (eraser?.defaultTips && eraser.defaultTips.length > 0) {
    defaultEraserStore.replaceAll(eraser.defaultTips);
  } else {
    defaultEraserStore.replaceAll(getFactoryEraserTips());
  }

  if (eraser?.tips && eraser.tips.length > 0) {
    documentEraserStore.replaceAll(eraser.tips);
  } else {
    documentEraserStore.seedFromDefault();
  }
}

export type HydrateDocumentSettingsResult = {
  /** Legacy DocumentSettings.palette.palettes for one-shot Sketch migration. */
  legacyPalettes: DocumentPalette[];
};

let settingsClientId: string | null = null;

/** Prefer the Document sync window clientId so settings WS echoes are skipped. */
export function setDocumentSettingsClientId(clientId: string): void {
  settingsClientId = clientId;
}

function getSettingsClientId(): string {
  if (!settingsClientId) {
    settingsClientId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `settings-${Date.now()}`;
  }
  return settingsClientId;
}

function normalizeDocumentSettingsPayload(raw: unknown): DocumentSettingsPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      schemaVersion: DOCUMENT_SETTINGS_SCHEMA_VERSION,
      overrides: {},
    };
  }
  const payload = raw as DocumentSettingsPayload;
  const providerPrefs = normalizeProviderPrefs(payload.providerPrefs);
  const assetLibrary = normalizeAssetLibrary(payload.assetLibrary);
  return {
    schemaVersion: payload.schemaVersion ?? DOCUMENT_SETTINGS_SCHEMA_VERSION,
    overrides: normalizeOverrides(payload.overrides),
    palette: normalizePalettePayload(payload.palette),
    eraser: normalizeEraserPayload(payload.eraser),
    providerPrefs: Object.keys(providerPrefs).length > 0 ? providerPrefs : undefined,
    assetLibrary: assetLibrary.length > 0 ? { assets: assetLibrary } : undefined,
  };
}

export async function applyDocumentSettingsPayload(
  raw: unknown,
): Promise<HydrateDocumentSettingsResult> {
  const { settingsStore } = await import('./store/settingsStore');
  const { defaultPaletteStore } = await import('./palette/defaultPaletteStore');
  const { defaultEraserStore } = await import('./eraser/defaultEraserStore');
  const { documentEraserStore } = await import('./eraser/documentEraserStore');
  const { assetLibraryStore } = await import('./asset-library/assetLibraryStore');
  const { replaceProviderPrefs } = await import('./provider-servers/providerPrefsStore');
  const { getCatalog } = await import('./catalogs');

  const catalog = getCatalog(DOCUMENT_PREFERENCES_CATALOG_ID);
  settingsStore.hydrate(DOCUMENT_PREFERENCES_CATALOG_ID, catalog);

  const payload = normalizeDocumentSettingsPayload(raw);
  settingsStore.replaceOverrides(DOCUMENT_PREFERENCES_CATALOG_ID, payload.overrides);

  let legacyPalettes: DocumentPalette[] = [];
  try {
    legacyPalettes = applyPaletteHydrate(defaultPaletteStore, payload.palette);
  } catch (err) {
    console.error('[desktop-ui] failed to hydrate palette settings', err);
    defaultPaletteStore.replaceAll(getFactoryPaletteBrushes());
  }

  try {
    applyEraserHydrate(defaultEraserStore, documentEraserStore, payload.eraser);
  } catch (err) {
    console.error('[desktop-ui] failed to hydrate eraser settings', err);
    defaultEraserStore.replaceAll(getFactoryEraserTips());
    documentEraserStore.seedFromDefault();
  }

  replaceProviderPrefs(payload.providerPrefs ?? {});
  assetLibraryStore.replaceAll(payload.assetLibrary?.assets ?? []);
  return { legacyPalettes };
}

async function loadDocumentSettingsFromIndexer(
  indexerUrl: string,
  documentId: string,
): Promise<DocumentSettingsPayload | null> {
  try {
    const base = indexerUrl.replace(/\/$/, '');
    const response = await fetch(`${base}/documents/${encodeURIComponent(documentId)}`);
    if (!response.ok) {
      return null;
    }
    const json = (await response.json()) as { settings?: unknown };
    if (!json.settings || typeof json.settings !== 'object') {
      return null;
    }
    const settings = json.settings as Record<string, unknown>;
    if (Object.keys(settings).length === 0) {
      return null;
    }
    return normalizeDocumentSettingsPayload(settings);
  } catch (err) {
    console.error('[desktop-ui] failed to load document settings from Indexer', err);
    return null;
  }
}

export async function hydrateDocumentSettings(
  indexerUrl: string | null,
  documentId: string | null,
): Promise<HydrateDocumentSettingsResult> {
  setDocumentIdentity(indexerUrl, documentId);

  if (!indexerUrl) {
    const { settingsStore } = await import('./store/settingsStore');
    const { defaultPaletteStore } = await import('./palette/defaultPaletteStore');
    const { defaultEraserStore } = await import('./eraser/defaultEraserStore');
    const { documentEraserStore } = await import('./eraser/documentEraserStore');
    const { assetLibraryStore } = await import('./asset-library/assetLibraryStore');
    const { replaceProviderPrefs } = await import('./provider-servers/providerPrefsStore');
    const { getCatalog } = await import('./catalogs');

    const catalog = getCatalog(DOCUMENT_PREFERENCES_CATALOG_ID);
    settingsStore.hydrate(DOCUMENT_PREFERENCES_CATALOG_ID, catalog);
    settingsStore.replaceOverrides(DOCUMENT_PREFERENCES_CATALOG_ID, {});
    defaultPaletteStore.replaceAll(getFactoryPaletteBrushes());
    defaultEraserStore.replaceAll(getFactoryEraserTips());
    documentEraserStore.seedFromDefault();
    replaceProviderPrefs({});
    assetLibraryStore.replaceAll([]);
    return { legacyPalettes: [] };
  }

  const resolvedDocumentId = documentId ?? DEFAULT_DOCUMENT_ID;
  let payload = await loadDocumentSettingsFromIndexer(indexerUrl, resolvedDocumentId);

  if (!payload) {
    const disk = await loadDocumentSettingsFromDisk(indexerUrl, resolvedDocumentId);
    const hasDisk =
      Object.keys(disk.overrides).length > 0 ||
      Boolean(disk.palette) ||
      Boolean(disk.eraser) ||
      Boolean(disk.providerPrefs) ||
      Boolean(disk.assetLibrary);
    if (hasDisk) {
      payload = disk;
      // One-shot migrate tray cache → Indexer.
      try {
        await putDocumentSettingsToIndexer(indexerUrl, resolvedDocumentId, disk);
      } catch (err) {
        console.error('[desktop-ui] failed to migrate document settings to Indexer', err);
      }
    } else {
      payload = {
        schemaVersion: DOCUMENT_SETTINGS_SCHEMA_VERSION,
        overrides: {},
      };
    }
  }

  return applyDocumentSettingsPayload(payload);
}

async function putDocumentSettingsToIndexer(
  indexerUrl: string,
  documentId: string,
  payload: DocumentSettingsPayload,
): Promise<void> {
  const base = indexerUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/documents/${encodeURIComponent(documentId)}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: payload,
      originClientId: getSettingsClientId(),
    }),
  });
  if (!response.ok) {
    throw new Error(`PUT document settings failed: ${response.status}`);
  }
}

/** Ensures factory metadata is reachable from the bridge module graph. */
export function documentSettingsFactoryVersion(): number {
  return getDocumentPreferencesFactory().schemaVersion;
}
