import type { SettingsCatalog, SettingValue } from '../types';

export function extractDefaults(catalog: SettingsCatalog): Record<string, SettingValue> {
  const defaults: Record<string, SettingValue> = {};

  for (const section of Object.values(catalog.sections)) {
    if (section.kind !== 'fields') continue;
    for (const group of section.groups) {
      for (const field of group.fields) {
        defaults[field.key] = field.default;
      }
    }
  }

  if (catalog.extraDefaults) {
    Object.assign(defaults, catalog.extraDefaults);
  }

  return defaults;
}
