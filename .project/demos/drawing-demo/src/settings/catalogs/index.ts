import type { CatalogId, SettingsCatalog } from '../types';
import type { SettingsCatalogId } from '../catalogIds';
import { aboutCatalog } from './about';
import { defaultsCatalog } from './defaults';
import { buildKitchenSinkCatalog } from './kitchen-sink';
import { documentPreferencesCatalog } from './document-preferences.tsx';

export type { SettingsCatalogId } from '../catalogIds';
export { isSettingsCatalogId } from '../catalogIds';

/** Resolve live catalog exports (avoid snapshotting into a const map — HMR can leave a stale nav). */
export function getCatalog(catalogId: SettingsCatalogId): SettingsCatalog {
  switch (catalogId) {
    case 'document-preferences':
      return documentPreferencesCatalog;
    case 'defaults':
      return defaultsCatalog;
    case 'about':
      return aboutCatalog;
    case 'debug-kitchen-sink':
      return buildKitchenSinkCatalog();
    default: {
      const _exhaustive: never = catalogId;
      throw new Error(`Unknown settings catalog: ${_exhaustive}`);
    }
  }
}

export function listCatalogIds(): CatalogId[] {
  return [
    'document-preferences',
    'defaults',
    'provider-servers',
    'about',
    'debug-kitchen-sink',
  ] as CatalogId[];
}

export {
  aboutCatalog,
  defaultsCatalog,
  documentPreferencesCatalog,
};
