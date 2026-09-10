import type { CanvasId } from '../ids';
import type { DocumentState } from '../types';
import { imagesForCanvas, imagesForGraph } from '../document/selectors';

/** Default display name for the first Image on a surface. */
export const UNTITLED_IMAGE_LABEL = 'Untitled Image';

function untitledOrdinalLabel(base: string, index: number): string {
  return index <= 0 ? base : `${base} ${index + 1}`;
}

/**
 * Next Untitled Image name among Graph-placed Images before insert.
 * 0 existing → `Untitled Image`; 1 existing → `Untitled Image 2`; …
 */
export function nextUntitledImageNameForGraph(state: DocumentState): string {
  const index = imagesForGraph(state).length;
  return untitledOrdinalLabel(UNTITLED_IMAGE_LABEL, index);
}

/**
 * Next Untitled Image name among Canvas-placed Images before insert.
 */
export function nextUntitledImageNameForCanvas(
  state: DocumentState,
  canvasId: CanvasId,
): string {
  const index = imagesForCanvas(state, canvasId).length;
  return untitledOrdinalLabel(UNTITLED_IMAGE_LABEL, index);
}
