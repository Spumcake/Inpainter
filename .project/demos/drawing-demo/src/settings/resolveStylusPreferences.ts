import {
  DOCUMENT_PREFERENCES_CATALOG_ID,
} from './documentSettingsBridge';
import { getDocumentPreferencesExtraDefaults } from './factory/loadDocumentPreferencesFactory';
import { settingsStore } from './store/settingsStore';
import type { SettingValue } from './types';

export type StylusPreferences = {
  /** Quadratic curve control point X (0–1). */
  pressureCurveX: number;
  /** Quadratic curve control point Y (0–1). */
  pressureCurveY: number;
};

const FALLBACK: StylusPreferences = {
  pressureCurveX: 0.5,
  pressureCurveY: 0.5,
};

function clamp01(raw: SettingValue | undefined, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, raw));
}

/**
 * Resolved Document Preferences Stylus curve (factory + overrides).
 * Safe when the Preferences catalog is not hydrated yet — uses factory JSON.
 */
export function resolveStylusPreferences(): StylusPreferences {
  const factory = getDocumentPreferencesExtraDefaults();
  const snapshot = settingsStore.getSnapshot(DOCUMENT_PREFERENCES_CATALOG_ID);
  return {
    pressureCurveX: clamp01(
      snapshot['stylus.pressureCurveX'] ?? factory['stylus.pressureCurveX'],
      FALLBACK.pressureCurveX,
    ),
    pressureCurveY: clamp01(
      snapshot['stylus.pressureCurveY'] ?? factory['stylus.pressureCurveY'],
      FALLBACK.pressureCurveY,
    ),
  };
}
