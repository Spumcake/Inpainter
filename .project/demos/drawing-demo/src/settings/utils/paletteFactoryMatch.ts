import type { Brush } from '../palette/types';
import { getFactoryPaletteBrushes } from '../factory/loadDocumentPreferencesFactory';

export function brushesMatchFactory(brushes: Brush[]): boolean {
  const factory = getFactoryPaletteBrushes();
  if (brushes.length !== factory.length) {
    return false;
  }
  return JSON.stringify(brushes) === JSON.stringify(factory);
}

export function paletteHasOverrides(brushes: Brush[]): boolean {
  return !brushesMatchFactory(brushes);
}
