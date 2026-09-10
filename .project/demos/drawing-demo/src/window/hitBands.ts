/** Outer rim (px) for East/South — keeps scrollbar interior reachable. */
export const EDGE = 5;
export const CORNER = EDGE * 2;
/** Custom canvas scrollbar thickness; gutter minus EDGE is scrollbar-interior. */
export const GUTTER = 12;
/**
 * West/North resize grip (px). No left/top scrollbar, so match GUTTER so the
 * grab lives inside the client area (users aiming at the OS border miss EDGE).
 */
export const SIDE_EDGE = GUTTER;
/** App header height (`h-9`); dragHeader lives below North SIDE_EDGE within this. */
export const HEADER_HEIGHT = 36;

export type ResizeDirection =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West';

export type HitBand =
  | { kind: 'resize'; direction: ResizeDirection }
  | { kind: 'dragHeader' }
  | { kind: 'scrollbar'; axis: 'x' | 'y' | 'corner' }
  | { kind: 'content' };

export const RESIZE_CURSOR: Record<ResizeDirection, string> = {
  North: 'n-resize',
  South: 's-resize',
  West: 'w-resize',
  East: 'e-resize',
  NorthWest: 'nw-resize',
  NorthEast: 'ne-resize',
  SouthWest: 'sw-resize',
  SouthEast: 'se-resize',
};

/**
 * Pure hit-band policy (window-handling.md).
 * East/South: EDGE wins over gutter. West/North: SIDE_EDGE resize grip.
 * Header move: below North rim, above HEADER_HEIGHT, outside side resize bands.
 */
export function hitBandAt(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): HitBand {
  const onLeft = clientX <= SIDE_EDGE;
  const onRight = clientX >= width - EDGE;
  const onTop = clientY <= SIDE_EDGE;
  const onBottom = clientY >= height - EDGE;
  const nearLeft = clientX <= SIDE_EDGE;
  const nearRight = clientX >= width - CORNER;
  const nearTop = clientY <= SIDE_EDGE;
  const nearBottom = clientY >= height - CORNER;

  if (nearTop && nearLeft) return { kind: 'resize', direction: 'NorthWest' };
  if (nearTop && nearRight) return { kind: 'resize', direction: 'NorthEast' };
  if (nearBottom && nearLeft) return { kind: 'resize', direction: 'SouthWest' };
  if (nearBottom && nearRight) return { kind: 'resize', direction: 'SouthEast' };
  if (onTop) return { kind: 'resize', direction: 'North' };
  if (onBottom) return { kind: 'resize', direction: 'South' };
  if (onLeft) return { kind: 'resize', direction: 'West' };
  if (onRight) return { kind: 'resize', direction: 'East' };

  if (
    clientY > SIDE_EDGE &&
    clientY < HEADER_HEIGHT &&
    clientX > SIDE_EDGE &&
    clientX < width - EDGE
  ) {
    return { kind: 'dragHeader' };
  }

  const inRightGutter = clientX >= width - GUTTER;
  const inBottomGutter = clientY >= height - GUTTER;
  if (inRightGutter && inBottomGutter) return { kind: 'scrollbar', axis: 'corner' };
  if (inRightGutter) return { kind: 'scrollbar', axis: 'y' };
  if (inBottomGutter) return { kind: 'scrollbar', axis: 'x' };

  return { kind: 'content' };
}

export function resizeDirectionAt(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): ResizeDirection | null {
  const band = hitBandAt(clientX, clientY, width, height);
  return band.kind === 'resize' ? band.direction : null;
}

export function isDragHeaderAt(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): boolean {
  return hitBandAt(clientX, clientY, width, height).kind === 'dragHeader';
}
