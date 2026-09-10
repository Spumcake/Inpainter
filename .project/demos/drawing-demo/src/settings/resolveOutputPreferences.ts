import {
  DOCUMENT_PREFERENCES_CATALOG_ID,
} from './documentSettingsBridge';
import { getDocumentPreferencesExtraDefaults } from './factory/loadDocumentPreferencesFactory';
import { settingsStore } from './store/settingsStore';
import type { SettingValue } from './types';

export type OutputPreferences = {
  ratio: { w: number; h: number };
  defaultWidth: number;
  defaultHeight: number;
};

const FALLBACK: OutputPreferences = {
  ratio: { w: 1, h: 1 },
  defaultWidth: 1024,
  defaultHeight: 1024,
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
 * Resolved Document Preferences Output defaults (factory + overrides).
 * Safe when the Preferences catalog is not hydrated yet — uses factory JSON.
 */
export function resolveOutputPreferences(): OutputPreferences {
  const factory = getDocumentPreferencesExtraDefaults();
  const snapshot = settingsStore.getSnapshot(DOCUMENT_PREFERENCES_CATALOG_ID);
  const ratioRaw = snapshot['output.ratio'] ?? factory['output.ratio'];
  const widthRaw =
    snapshot['output.defaultWidth'] ?? factory['output.defaultWidth'];
  const heightRaw =
    snapshot['output.defaultHeight'] ?? factory['output.defaultHeight'];

  return {
    ratio: parseRatio(ratioRaw),
    defaultWidth: positiveInt(widthRaw, FALLBACK.defaultWidth),
    defaultHeight: positiveInt(heightRaw, FALLBACK.defaultHeight),
  };
}

export function formatOutputRatio(ratio: { w: number; h: number }): string {
  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : String(n);
  return `${fmt(ratio.w)}:${fmt(ratio.h)}`;
}
