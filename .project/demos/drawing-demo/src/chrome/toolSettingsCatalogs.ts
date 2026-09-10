import type { CatalogId } from '../settings/types';

/**
 * Settings catalogs opened from Tool Config (ellipsis / host-routed tool libraries).
 * While one of these owns the window, the Tool Config header button stays Live so
 * the user can dismiss — same escape-hatch pattern as logo → About.
 *
 * Register future tool-library hosts here (not Preferences / About / Asset Library).
 */
const TOOL_SETTINGS_CATALOGS = new Set<CatalogId>(['palettes', 'erasers']);

export function isToolSettingsCatalog(catalogId: CatalogId): boolean {
  return TOOL_SETTINGS_CATALOGS.has(catalogId);
}
