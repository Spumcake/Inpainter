import type { SettingValue } from '../types';

export type ProviderPrefsMap = Record<string, Record<string, SettingValue>>;

let providerPrefs: ProviderPrefsMap = {};

export function getProviderPrefs(): ProviderPrefsMap {
  const next: ProviderPrefsMap = {};
  for (const [providerId, overrides] of Object.entries(providerPrefs)) {
    next[providerId] = { ...overrides };
  }
  return next;
}

export function replaceProviderPrefs(next: ProviderPrefsMap): void {
  providerPrefs = {};
  for (const [providerId, overrides] of Object.entries(next)) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      continue;
    }
    providerPrefs[providerId] = { ...overrides };
  }
}

export function providerPrefsIsEmpty(): boolean {
  return Object.keys(providerPrefs).length === 0;
}
