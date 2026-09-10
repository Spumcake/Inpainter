import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from '../tauri-env';

export const STYLUS_PRESSURE_EVENT = 'stylus-pressure-sample';

/** Default max age for a native sample to still modulate stroke width. */
export const STYLUS_PRESSURE_MAX_AGE_MS = 80;

export type StylusPressureSample = {
  pressure: number;
  isEraser: boolean;
  receivedAt: number;
};

type StylusPressurePayload = {
  pressure: number;
  is_eraser: boolean;
};

let latest: StylusPressureSample | null = null;
let started = false;
let unlisten: UnlistenFn | null = null;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/**
 * Start listening for tray-emitted native stylus samples.
 * Safe to call multiple times; no-op outside Tauri.
 */
export async function initStylusPressureBridge(): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }
  if (started) {
    return () => {
      /* keep shared listener for the window lifetime */
    };
  }
  started = true;

  try {
    unlisten = await listen<StylusPressurePayload>(STYLUS_PRESSURE_EVENT, (event) => {
      const pressure = clamp01(event.payload.pressure);
      latest = {
        pressure,
        isEraser: Boolean(event.payload.is_eraser),
        receivedAt: performance.now(),
      };
    });
  } catch (error) {
    started = false;
    console.warn('[stylus-pressure] listen failed', error);
    return () => {};
  }

  return () => {
    unlisten?.();
    unlisten = null;
    started = false;
    latest = null;
  };
}

/** Latest sample if younger than maxAgeMs; otherwise undefined (treat as mouse). */
export function getFreshStylusPressure(
  maxAgeMs: number = STYLUS_PRESSURE_MAX_AGE_MS,
): number | undefined {
  if (!latest) return undefined;
  if (performance.now() - latest.receivedAt > maxAgeMs) return undefined;
  return latest.pressure;
}

/** Test / diagnostics helper. */
export function getLatestStylusSample(): StylusPressureSample | null {
  return latest;
}

/** Test-only: inject a sample without Tauri listen. */
export function __setStylusSampleForTests(
  sample: StylusPressureSample | null,
): void {
  latest = sample;
}
