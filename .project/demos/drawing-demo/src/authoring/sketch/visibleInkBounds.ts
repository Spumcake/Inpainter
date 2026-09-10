import type { NodeId } from '../ids';
import type { Rect, SketchData, Stroke } from '../types';
import {
  boundsOfSketchPaths,
  paintHullOfSketchPaths,
  pathBelongsToSketch,
  SKETCH_FIT_PADDING,
} from './bounds';

/** Half-resolution probe (world → probe pixels). */
export const VISIBLE_INK_PROBE_SCALE = 0.5;

/** Extra pad (world units) when using the downscaled probe. */
export const VISIBLE_INK_PROBE_SLACK = 2;

/** Cap probe bitmap side length (pixels) to avoid huge allocations. */
export const VISIBLE_INK_PROBE_MAX_DIM = 2048;

const DEFAULT_STROKE_WIDTH = 4;

export type ProbeSurface = {
  width: number;
  height: number;
  getContext(type: '2d'): ProbeCanvasContext | null;
};

export type ProbeCanvasContext = {
  clearRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
  globalCompositeOperation: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
};

export type CreateProbeSurface = (width: number, height: number) => ProbeSurface | null;

function defaultCreateProbeSurface(width: number, height: number): ProbeSurface | null {
  if (typeof OffscreenCanvas === 'undefined') {
    return null;
  }
  try {
    return new OffscreenCanvas(width, height) as unknown as ProbeSurface;
  } catch {
    return null;
  }
}

function strokeWidthOf(path: Stroke): number {
  const raw = path.attrs?.strokeWidth;
  return typeof raw === 'number' && raw > 0 ? raw : DEFAULT_STROKE_WIDTH;
}

function isEraseStroke(path: Stroke): boolean {
  return path.attrs?.drawMode === false;
}

type SublayerStrokeGroup = {
  paths: Stroke[];
};

function collectSublayerGroups(
  sketch: SketchData,
  sketchId: NodeId,
  soleSketchId: NodeId | null,
): SublayerStrokeGroup[] {
  const groups: SublayerStrokeGroup[] = [];
  for (const layer of sketch.layers) {
    for (const sublayer of layer.sublayers) {
      const paths = sublayer.paths.filter((path) =>
        pathBelongsToSketch(path, sketchId, soleSketchId),
      );
      if (paths.length > 0) {
        groups.push({ paths });
      }
    }
  }
  return groups;
}

function hasErase(groups: SublayerStrokeGroup[]): boolean {
  return groups.some((g) => g.paths.some(isEraseStroke));
}

function hasPaint(groups: SublayerStrokeGroup[]): boolean {
  return groups.some((g) => g.paths.some((p) => !isEraseStroke(p)));
}

function maxHalfWidth(groups: SublayerStrokeGroup[]): number {
  let max = DEFAULT_STROKE_WIDTH / 2;
  for (const group of groups) {
    for (const path of group.paths) {
      max = Math.max(max, strokeWidthOf(path) / 2);
    }
  }
  return max;
}

function expandRect(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: Math.max(1, rect.width + margin * 2),
    height: Math.max(1, rect.height + margin * 2),
  };
}

function resolveProbeScale(candidateW: number, candidateH: number): number {
  let scale = VISIBLE_INK_PROBE_SCALE;
  const maxSide = Math.max(candidateW, candidateH) * scale;
  if (maxSide > VISIBLE_INK_PROBE_MAX_DIM) {
    scale = VISIBLE_INK_PROBE_MAX_DIM / Math.max(candidateW, candidateH, 1);
  }
  return Math.max(scale, 1 / 64);
}

function drawStrokePath(ctx: ProbeCanvasContext, path: Stroke): void {
  const points = path.points;
  if (points.length === 0) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  if (points.length === 1) {
    // Degenerate: draw a tiny segment so round cap leaves a dot.
    ctx.lineTo(points[0]!.x + 0.01, points[0]!.y);
  }
  ctx.stroke();
}

function drawSublayerChronology(ctx: ProbeCanvasContext, paths: Stroke[]): void {
  for (const path of paths) {
    const width = strokeWidthOf(path);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (isEraseStroke(path)) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#000000';
    }
    drawStrokePath(ctx, path);
  }
  ctx.globalCompositeOperation = 'source-over';
}

type PixelBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function scanAlphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): PixelBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3]!;
      if (alpha === 0) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function unionPixelBounds(a: PixelBounds | null, b: PixelBounds): PixelBounds {
  if (!a) {
    return b;
  }
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function probeVisibleInk(
  groups: SublayerStrokeGroup[],
  candidate: Rect,
  createSurface: CreateProbeSurface,
): Rect | null {
  const scale = resolveProbeScale(candidate.width, candidate.height);
  const pixelW = Math.max(1, Math.ceil(candidate.width * scale));
  const pixelH = Math.max(1, Math.ceil(candidate.height * scale));
  const surface = createSurface(pixelW, pixelH);
  if (!surface) {
    return null;
  }
  const ctx = surface.getContext('2d');
  if (!ctx) {
    return null;
  }

  let union: PixelBounds | null = null;

  for (const group of groups) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixelW, pixelH);
    // Map world → probe: scale then translate so candidate origin → (0,0).
    ctx.setTransform(scale, 0, 0, scale, -candidate.x * scale, -candidate.y * scale);
    drawSublayerChronology(ctx, group.paths);
    const image = ctx.getImageData(0, 0, pixelW, pixelH);
    const bounds = scanAlphaBounds(image.data, pixelW, pixelH);
    if (bounds) {
      union = unionPixelBounds(union, bounds);
    }
  }

  if (!union) {
    return null;
  }

  // Inclusive pixel max → world (outer edge of max pixel).
  const worldMinX = candidate.x + union.minX / scale;
  const worldMinY = candidate.y + union.minY / scale;
  const worldMaxX = candidate.x + (union.maxX + 1) / scale;
  const worldMaxY = candidate.y + (union.maxY + 1) / scale;
  const pad = SKETCH_FIT_PADDING + VISIBLE_INK_PROBE_SLACK;
  return {
    x: worldMinX - pad,
    y: worldMinY - pad,
    width: Math.max(1, worldMaxX - worldMinX + pad * 2),
    height: Math.max(1, worldMaxY - worldMinY + pad * 2),
  };
}

export type FitSketchVisibleInkBoundsOptions = {
  createProbeSurface?: CreateProbeSurface;
};

/**
 * Fit Sketch Node canvas to visible ink after chronological paint/erase.
 * Fast path (no erase): padded paint-point AABB.
 * With erase: low-res OffscreenCanvas probe; falls back to paint AABB if probe unavailable.
 */
export function fitSketchVisibleInkBounds(
  sketch: SketchData,
  sketchId: NodeId,
  soleSketchId: NodeId | null = sketchId,
  options?: FitSketchVisibleInkBoundsOptions,
): Rect | null {
  const groups = collectSublayerGroups(sketch, sketchId, soleSketchId);
  if (!hasPaint(groups)) {
    return null;
  }
  if (!hasErase(groups)) {
    return boundsOfSketchPaths(sketch, sketchId, soleSketchId);
  }

  const hull = paintHullOfSketchPaths(sketch, sketchId, soleSketchId);
  if (!hull) {
    return null;
  }

  const createSurface = options?.createProbeSurface ?? defaultCreateProbeSurface;
  const candidate = expandRect(hull, maxHalfWidth(groups));
  try {
    const probed = probeVisibleInk(groups, candidate, createSurface);
    if (probed) {
      return probed;
    }
  } catch {
    // Fall through to paint AABB.
  }
  return boundsOfSketchPaths(sketch, sketchId, soleSketchId);
}
