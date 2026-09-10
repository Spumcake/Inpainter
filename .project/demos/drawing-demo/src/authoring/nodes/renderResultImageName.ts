import type { CanvasId } from '../ids';
import type { DocumentState } from '../types';
import { imagesForCanvas } from '../document/selectors';

/** Default display name for the first Frame/Sketch render result Image. */
export const RENDER_RESULT_LABEL = 'Render Result';

const RENDER_RESULT_NAME = /^Render Result(?: (\d+))?$/;

function ordinalLabel(base: string, index: number): string {
  return index <= 0 ? base : `${base} ${index + 1}`;
}

/**
 * Next Render Result name among Canvas Images already using that label.
 * 0 → `Render Result`; 1 → `Render Result 2`; …
 */
export function nextRenderResultImageName(
  state: Pick<DocumentState, 'nodes'>,
  canvasId: CanvasId,
): string {
  const count = imagesForCanvas(state as DocumentState, canvasId).filter((image) =>
    RENDER_RESULT_NAME.test(image.name),
  ).length;
  return ordinalLabel(RENDER_RESULT_LABEL, count);
}
