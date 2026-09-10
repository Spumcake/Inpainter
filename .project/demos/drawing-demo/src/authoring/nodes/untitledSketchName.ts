import type { CanvasId } from '../ids';
import type { DocumentState } from '../types';
import { listSketchesForCanvas } from './listSketches';

/** Default display name for the first Sketch on a Canvas. */
export const UNTITLED_SKETCH_LABEL = 'Untitled Sketch';

function untitledOrdinalLabel(base: string, index: number): string {
  return index <= 0 ? base : `${base} ${index + 1}`;
}

/**
 * Next Untitled Sketch name for a Canvas before insert.
 * 0 existing → `Untitled Sketch`; 1 existing → `Untitled Sketch 2`; …
 */
export function nextUntitledSketchName(
  state: DocumentState,
  canvasId: CanvasId,
): string {
  const index = listSketchesForCanvas(state, canvasId).length;
  return untitledOrdinalLabel(UNTITLED_SKETCH_LABEL, index);
}
