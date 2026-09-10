import type { Rect } from '../../authoring/types';

/** Shared transform-chrome interaction policy (widget-owned contract). */
export type TransformChromeInteraction = {
  /** Full-body hit pad moves the box. Default true. */
  bodyMove?: boolean;
  /**
   * Opaque fill drawn by TransformBoxUnderlay below content.
   * When set, chrome SVG must not paint the same fill on top.
   */
  underlayFill?: string;
};

/** Canvas Frame interior when underlay is not used (legacy chrome-layer fill). */
export const CANVAS_FRAME_FILL = '#ffffff';

export function resolveBodyMove(
  interaction?: TransformChromeInteraction,
): boolean {
  return interaction?.bodyMove ?? true;
}

/** Chrome-layer interior fill; underlay owns fill when configured. */
export function resolveChromeInteriorFill(
  interaction?: TransformChromeInteraction,
  geometry: 'graph' | 'crop' = 'graph',
): string {
  if (interaction?.underlayFill) {
    return 'none';
  }
  return geometry === 'crop' ? CANVAS_FRAME_FILL : 'none';
}

export function shouldMountBodyMovePad(
  interactive: boolean,
  bodyMove: boolean,
): boolean {
  return interactive && bodyMove;
}

export type UnderlayBox = {
  id: string;
  rect: Rect;
};

/** Apply live transform draft rects to a stable underlay box list. */
export function resolveUnderlayRects(
  boxes: UnderlayBox[],
  draftById?: Map<string, Rect> | null,
): UnderlayBox[] {
  if (!draftById || draftById.size === 0) {
    return boxes;
  }
  return boxes.map((box) => {
    const draft = draftById.get(box.id);
    return draft ? { id: box.id, rect: draft } : box;
  });
}
