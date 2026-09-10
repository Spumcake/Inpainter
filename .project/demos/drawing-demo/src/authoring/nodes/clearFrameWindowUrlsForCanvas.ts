import type { CanvasId } from '../ids';
import type { DocumentState } from '../types';

/**
 * Drop interim Frame window URLs for Frames on `canvasId`.
 * Call when Canvas drawing changes so Graph cards fall back to live crop preview.
 */
export function clearFrameWindowUrlsForCanvas(
  draft: DocumentState,
  canvasId: CanvasId,
): void {
  for (const node of Object.values(draft.nodes)) {
    if (
      node.type === 'frame' &&
      node.canvasId === canvasId &&
      node.frameWindowUrl != null
    ) {
      delete node.frameWindowUrl;
    }
  }
}
