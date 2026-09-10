import {
  DOCUMENT_PREFERENCES_CATALOG_ID,
} from './documentSettingsBridge';
import { getDocumentPreferencesExtraDefaults } from './factory/loadDocumentPreferencesFactory';
import { settingsStore } from './store/settingsStore';
import type { SettingValue } from './types';

export type FramePreferences = {
  ratio: { w: number; h: number };
  defaultWidth: number;
  defaultHeight: number;
};

const FALLBACK: FramePreferences = {
  ratio: { w: 16, h: 9 },
  defaultWidth: 1280,
  defaultHeight: 720,
};

function parseRatio(raw: SettingValue | undefined): { w: number; h: number } {
  const value = typeof raw === 'string' ? raw.trim() : '';
  const match = /^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/i.exec(value);
  if (!match) return { ...FALLBACK.ratio };
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return { ...FALLBACK.ratio };
  }
  return { w, h };
}

function positiveInt(raw: SettingValue | undefined, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) {
    return fallback;
  }
  return Math.round(raw);
}

/**
 * Resolved Document Preferences Frame defaults (factory + overrides).
 * Safe when the Preferences catalog is not hydrated yet — uses factory JSON.
 */
export function resolveFramePreferences(): FramePreferences {
  const factory = getDocumentPreferencesExtraDefaults();
  const snapshot = settingsStore.getSnapshot(DOCUMENT_PREFERENCES_CATALOG_ID);
  const ratioRaw = snapshot['frame.ratio'] ?? factory['frame.ratio'];
  const widthRaw = snapshot['frame.defaultWidth'] ?? factory['frame.defaultWidth'];
  const heightRaw =
    snapshot['frame.defaultHeight'] ?? factory['frame.defaultHeight'];

  return {
    ratio: parseRatio(ratioRaw),
    defaultWidth: positiveInt(widthRaw, FALLBACK.defaultWidth),
    defaultHeight: positiveInt(heightRaw, FALLBACK.defaultHeight),
  };
}
