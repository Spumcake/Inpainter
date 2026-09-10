import type { FactoryBrushPalette } from '../factory/loadDocumentPreferencesFactory';

/** A brush entry within a palette (color, size, opacity, smoothing). */
export type Brush = FactoryBrushPalette;

/** @deprecated Prefer `Brush`. Alias kept for gradual migration. */
export type BrushPalette = Brush;

/**
 * Named palette owned by a Sketch. `brushes` is the shared-slot row:
 * filled brushes and `null` empties, equal length across palettes **in that Sketch’s set**.
 */
export type DocumentPalette = {
  id: string;
  name: string;
  brushes: Array<Brush | null>;
};

/** Alias — runtime palette instances live on the Sketch Node. */
export type SketchPalette = DocumentPalette;
