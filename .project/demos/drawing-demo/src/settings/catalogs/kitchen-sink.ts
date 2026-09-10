import type { SettingsCatalog } from '../types';
import { aboutCatalog } from './about';
import { defaultsCatalog } from './defaults';
import { documentPreferencesCatalog } from './document-preferences.tsx';

export const KITCHEN_SINK_SECTION_SEP = '::';

/** Asset Library and Provider Servers are host-routed, not catalog sections. */
const SOURCE_CATALOGS: SettingsCatalog[] = [
  documentPreferencesCatalog,
  defaultsCatalog,
  aboutCatalog,
];

export function buildKitchenSinkCatalog(): SettingsCatalog {
  const nav: SettingsCatalog['nav'] = [];
  const sections: SettingsCatalog['sections'] = {};

  for (const catalog of SOURCE_CATALOGS) {
    for (const item of catalog.nav) {
      const compositeId = `${catalog.id}${KITCHEN_SINK_SECTION_SEP}${item.id}`;
      nav.push({
        id: compositeId,
        label: `${item.label} · ${catalog.title}`,
      });
      sections[compositeId] = catalog.sections[item.id];
    }
  }

  return {
    id: 'debug-kitchen-sink',
    title: 'Settings (Debug Kitchen Sink)',
    nav,
    sections,
  };
}

export function resolveKitchenSinkSection(sectionId: string): {
  catalogId: string;
  sectionId: string;
} {
  const sepIndex = sectionId.indexOf(KITCHEN_SINK_SECTION_SEP);
  if (sepIndex === -1) {
    return { catalogId: 'debug-kitchen-sink', sectionId };
  }
  return {
    catalogId: sectionId.slice(0, sepIndex),
    sectionId: sectionId.slice(sepIndex + KITCHEN_SINK_SECTION_SEP.length),
  };
}

export { SOURCE_CATALOGS };
