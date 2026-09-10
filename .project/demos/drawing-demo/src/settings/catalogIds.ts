/** Catalog ids that use SettingsHost — no catalog module side effects. */
export const SETTINGS_CATALOG_IDS = [
  'document-preferences',
  'defaults',
  'about',
  'debug-kitchen-sink',
] as const;

export type SettingsCatalogId = (typeof SETTINGS_CATALOG_IDS)[number];

export function isSettingsCatalogId(id: string): id is SettingsCatalogId {
  return (SETTINGS_CATALOG_IDS as readonly string[]).includes(id);
}
