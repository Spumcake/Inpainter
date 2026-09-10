import type { Rect } from '../../authoring/types';

export type AspectRatioParts = { w: number; h: number };

/** Build an axis-aligned rect from two world points (drag create). */
export function rectFromDragPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  minSize = 1,
): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.max(minSize, Math.abs(b.x - a.x));
  const height = Math.max(minSize, Math.abs(b.y - a.y));
  return { x, y, width, height };
}

/**
 * Axis-aligned create rect locked to `aspect` (W:H), anchored at drag start.
 * Dominant drag axis wins; the other dimension follows the ratio.
 */
export function rectFromDragPointsAspectLocked(
  a: { x: number; y: number },
  b: { x: number; y: number },
  aspect: AspectRatioParts,
  minSize = 1,
): Rect {
  const ratioW = aspect.w > 0 ? aspect.w : 1;
  const ratioH = aspect.h > 0 ? aspect.h : 1;
  const target = ratioW / ratioH;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rawW = Math.abs(dx);
  const rawH = Math.abs(dy);

  let width: number;
  let height: number;
  if (rawW === 0 && rawH === 0) {
    width = minSize;
    height = Math.max(minSize, minSize / target);
  } else if (rawH === 0 || rawW / rawH >= target) {
    width = Math.max(minSize, rawW);
    height = Math.max(minSize, width / target);
  } else {
    height = Math.max(minSize, rawH);
    width = Math.max(minSize, height * target);
  }

  const x = dx >= 0 ? a.x : a.x - width;
  const y = dy >= 0 ? a.y : a.y - height;
  return { x, y, width, height };
}

/** Prefs-sized rect with top-left at the drag start point. */
export function rectAtPointWithSize(
  origin: { x: number; y: number },
  size: { width: number; height: number },
): Rect {
  return {
    x: origin.x,
    y: origin.y,
    width: Math.max(1, size.width),
    height: Math.max(1, size.height),
  };
}

export function isMeaningfulCreateRect(rect: Rect, minDrag = 4): boolean {
  return rect.width >= minDrag && rect.height >= minDrag;
}
