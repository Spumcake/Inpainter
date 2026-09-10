import type { NodeId } from '../ids';
import type { Point2D, Rect, SketchData, SketchNode, Stroke } from '../types';

const MIN_RECT_SIZE = 1;
const MIN_STROKE_WIDTH = 0.5;

export function clampRectSize(rect: Rect): Rect {
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(MIN_RECT_SIZE, rect.width),
    height: Math.max(MIN_RECT_SIZE, rect.height),
  };
}

/** Map a point from oldRect space into newRect space (non-uniform scale). */
export function mapPointThroughRects(
  point: Point2D,
  oldRect: Rect,
  newRect: Rect,
): Point2D {
  const sx = oldRect.width === 0 ? 1 : newRect.width / oldRect.width;
  const sy = oldRect.height === 0 ? 1 : newRect.height / oldRect.height;
  return {
    x: newRect.x + (point.x - oldRect.x) * sx,
    y: newRect.y + (point.y - oldRect.y) * sy,
  };
}

/** Geometric-mean scale for stroke width under non-uniform box resize. */
export function strokeWidthScale(oldRect: Rect, newRect: Rect): number {
  const sx = oldRect.width === 0 ? 1 : Math.abs(newRect.width / oldRect.width);
  const sy =
    oldRect.height === 0 ? 1 : Math.abs(newRect.height / oldRect.height);
  return Math.sqrt(sx * sy);
}

/** Durable Sketch content-scale product; missing / invalid → 1. */
export function sketchInkScale(
  node: Pick<SketchNode, 'inkScale'> | null | undefined,
): number {
  const value = node?.inkScale;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return value;
}

/** World stroke width from logical tip size and Sketch inkScale. */
export function effectiveStrokeWidth(tipSize: number, inkScale: number): number {
  const tip =
    typeof tipSize === 'number' && Number.isFinite(tipSize) ? tipSize : 0;
  const scale =
    typeof inkScale === 'number' && Number.isFinite(inkScale) && inkScale > 0
      ? inkScale
      : 1;
  return Math.max(MIN_STROKE_WIDTH, tip * scale);
}

/** Whether a stroke belongs to a Sketch (legacy untagged → sole Sketch). */
export function strokeBelongsToSketch(
  path: Stroke,
  sketchId: NodeId,
  soleSketchId: NodeId | null,
): boolean {
  if (path.sketchId === sketchId) {
    return true;
  }
  // Legacy untagged paths: attribute to the only Sketch on the canvas.
  if (path.sketchId == null && soleSketchId === sketchId) {
    return true;
  }
  return false;
}

function pathBelongsToSketch(
  path: Stroke,
  sketchId: NodeId,
  soleSketchId: NodeId | null,
): boolean {
  return strokeBelongsToSketch(path, sketchId, soleSketchId);
}

/**
 * Scale stroke points (and numeric strokeWidth attrs) for paths belonging to
 * `sketchId`. Mutates sketch data in place (draft).
 */
export function scaleSketchPathsThroughRects(
  sketch: SketchData,
  oldRect: Rect,
  newRect: Rect,
  sketchId: NodeId,
  soleSketchId: NodeId | null = sketchId,
): void {
  const widthScale = strokeWidthScale(oldRect, newRect);

  for (const layer of sketch.layers) {
    for (const sublayer of layer.sublayers) {
      for (const path of sublayer.paths) {
        if (!pathBelongsToSketch(path, sketchId, soleSketchId)) {
          continue;
        }
        for (const point of path.points) {
          const mapped = mapPointThroughRects(point, oldRect, newRect);
          point.x = mapped.x;
          point.y = mapped.y;
        }
        if (
          path.attrs &&
          typeof path.attrs.strokeWidth === 'number' &&
          Number.isFinite(path.attrs.strokeWidth)
        ) {
          path.attrs.strokeWidth = Math.max(
            MIN_STROKE_WIDTH,
            path.attrs.strokeWidth * widthScale,
          );
        }
      }
    }
  }
}
