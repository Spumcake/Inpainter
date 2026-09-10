import type { DocumentPalette } from '../../settings/palette/types';
import type { DocumentStore } from '../document/documentStore';
import { repairSketchPaletteSets } from './sketchPalette';

/**
 * Ensure every Sketch has a valid owned palette set.
 * Pass legacy flat-catalog rows from DocumentSettings hydrate for one-shot migration.
 */
export function repairSketchPaletteBinds(
  documentStore: DocumentStore,
  legacyCatalog: DocumentPalette[] = [],
): number {
  return repairSketchPaletteSets(documentStore, legacyCatalog);
}
