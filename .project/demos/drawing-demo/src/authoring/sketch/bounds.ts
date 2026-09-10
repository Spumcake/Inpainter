import type { NodeId } from '../ids';
import type { Rect, SketchData, Stroke } from '../types';

/** Padding applied when fitting a Sketch bounds to stroke bounds. */
export const SKETCH_FIT_PADDING = 8;

/** @deprecated Use SKETCH_FIT_PADDING */
export const BOUNDING_BOX_FIT_PADDING = SKETCH_FIT_PADDING;

export function pathBelongsToSketch(
  path: Stroke,
  sketchId: NodeId | null,
  soleSketchId: NodeId | null,
): boolean {
  if (sketchId == null) {
    return true;
  }
  if (path.sketchId === sketchId) {
    return true;
  }
  if (path.sketchId == null && soleSketchId === sketchId) {
    return true;
  }
  return false;
}

/**
 * Unpadded axis-aligned hull of **paint** stroke points for a Sketch.
 * Erase paths (`drawMode: false`) are ignored. Returns null when no paint points.
 */
export function paintHullOfSketchPaths(
  sketch: SketchData,
  sketchId: NodeId | null = null,
  soleSketchId: NodeId | null = sketchId,
): Rect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const layer of sketch.layers) {
    for (const sublayer of layer.sublayers) {
      for (const path of sublayer.paths) {
        if (!pathBelongsToSketch(path, sketchId, soleSketchId)) {
          continue;
        }
        if (path.attrs?.drawMode === false) {
          continue;
        }
        for (const point of path.points) {
          found = true;
          if (point.x < minX) minX = point.x;
          if (point.y < minY) minY = point.y;
          if (point.x > maxX) maxX = point.x;
          if (point.y > maxY) maxY = point.y;
        }
      }
    }
  }

  if (!found) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function padRect(rect: Rect, pad: number): Rect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: Math.max(1, rect.width + pad * 2),
    height: Math.max(1, rect.height + pad * 2),
  };
}

/**
 * Axis-aligned bounds of **paint** stroke points in Sketch Data (+ fit padding).
 * Erase paths (`drawMode: false`) are ignored.
 * When `sketchId` is set, only paths for that Sketch are included
 * (legacy untagged paths count when `soleSketchId` matches).
 * Returns null when there are no matching paint points.
 */
export function boundsOfSketchPaths(
  sketch: SketchData,
  sketchId: NodeId | null = null,
  soleSketchId: NodeId | null = sketchId,
): Rect | null {
  const hull = paintHullOfSketchPaths(sketch, sketchId, soleSketchId);
  if (!hull) {
    return null;
  }
  return padRect(hull, SKETCH_FIT_PADDING);
}

/** Artboard-sized rect at the Sketch origin (empty-stroke fallback). */
export function artboardRectFromSketch(sketch: SketchData): Rect {
  return {
    x: 0,
    y: 0,
    width: sketch.width,
    height: sketch.height,
  };
}
