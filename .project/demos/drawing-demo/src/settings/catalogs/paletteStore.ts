/**
 * @deprecated Import from `settings/palette` instead.
 * Compatibility shim: Preferences default brushes lived here historically.
 */
export type { Brush as BrushPalette, Brush } from '../palette/types';
export {
  defaultPaletteStore as paletteStore,
  useDefaultPaletteBrushes as usePaletteBrushes,
} from '../palette/defaultPaletteStore';

import { defaultPaletteStore } from '../palette/defaultPaletteStore';

/** @deprecated Prefer `defaultPaletteStore.resetToFactory()`. */
export function resetPaletteStoreToDefaults(): void {
  defaultPaletteStore.resetToFactory();
}
