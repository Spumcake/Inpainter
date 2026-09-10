import { CORNER, EDGE, RESIZE_CURSOR, SIDE_EDGE } from './hitBands';

/**
 * Window-owned resize edge strips — sole owner of edge resize cursors.
 * Pointerdown is handled by useWindowGestureRouter (capture); strips only win
 * CSS cursor over content (ViewportShell).
 */
export function WindowEdgeLayer() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[55]"
      aria-hidden
    >
      {/* Corners first so they sit above edge strips visually for cursor. */}
      <div
        className="pointer-events-auto absolute left-0 top-0"
        style={{
          width: SIDE_EDGE,
          height: SIDE_EDGE,
          cursor: RESIZE_CURSOR.NorthWest,
        }}
      />
      <div
        className="pointer-events-auto absolute right-0 top-0"
        style={{
          width: CORNER,
          height: SIDE_EDGE,
          cursor: RESIZE_CURSOR.NorthEast,
        }}
      />
      <div
        className="pointer-events-auto absolute bottom-0 left-0"
        style={{
          width: SIDE_EDGE,
          height: CORNER,
          cursor: RESIZE_CURSOR.SouthWest,
        }}
      />
      <div
        className="pointer-events-auto absolute bottom-0 right-0"
        style={{
          width: CORNER,
          height: CORNER,
          cursor: RESIZE_CURSOR.SouthEast,
        }}
      />
      {/* Edges (inset from corners so corner cursors win at corners). */}
      <div
        className="pointer-events-auto absolute left-0"
        style={{
          top: SIDE_EDGE,
          bottom: CORNER,
          width: SIDE_EDGE,
          cursor: RESIZE_CURSOR.West,
        }}
      />
      <div
        className="pointer-events-auto absolute right-0"
        style={{
          top: SIDE_EDGE,
          bottom: CORNER,
          width: EDGE,
          cursor: RESIZE_CURSOR.East,
        }}
      />
      <div
        className="pointer-events-auto absolute top-0"
        style={{
          left: SIDE_EDGE,
          right: CORNER,
          height: SIDE_EDGE,
          cursor: RESIZE_CURSOR.North,
        }}
      />
      <div
        className="pointer-events-auto absolute bottom-0"
        style={{
          left: SIDE_EDGE,
          right: CORNER,
          height: EDGE,
          cursor: RESIZE_CURSOR.South,
        }}
      />
    </div>
  );
}
