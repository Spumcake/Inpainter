import type { CanvasPath, CanvasPoint } from './engine/types';

export type PressureCurve = {
  pressureCurveX: number;
  pressureCurveY: number;
};

export type StrokeSegment = {
  d: string;
  strokeWidth: number;
};

const MIN_WIDTH_RATIO = 0.05;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Map input pressure through the Document Stylus quadratic curve
 * (endpoints fixed at (0,0) and (1,1); one control point).
 */
export function mapPressureThroughCurve(
  input: number,
  curve: PressureCurve,
): number {
  const x = clamp01(input);
  const cx = clamp01(curve.pressureCurveX);
  const cy = clamp01(curve.pressureCurveY);

  // Bx(t) = 2*cx*t + (1 - 2*cx)*t^2  == x  → solve for t in [0,1]
  const a = 1 - 2 * cx;
  const b = 2 * cx;
  let t: number;
  if (Math.abs(a) < 1e-9) {
    t = Math.abs(b) < 1e-9 ? x : x / b;
  } else {
    const disc = Math.max(0, b * b - 4 * a * (-x));
    const sqrt = Math.sqrt(disc);
    const tPos = (-b + sqrt) / (2 * a);
    const tNeg = (-b - sqrt) / (2 * a);
    t = tPos >= 0 && tPos <= 1 ? tPos : tNeg;
  }
  t = clamp01(t);
  const mt = 1 - t;
  return clamp01(2 * mt * t * cy + t * t);
}

/** True when point pressures should modulate tip width (not legacy constant 0.5). */
export function pathHasPressureModulation(points: CanvasPoint[]): boolean {
  for (const point of points) {
    if (typeof point.pressure !== 'number' || !Number.isFinite(point.pressure)) {
      continue;
    }
    if (Math.abs(point.pressure - 0.5) > 1e-6) {
      return true;
    }
  }
  return false;
}

export function widthForPressure(
  tipWidth: number,
  pressure: number,
  curve: PressureCurve,
): number {
  const mapped = mapPressureThroughCurve(pressure, curve);
  const ratio = Math.max(MIN_WIDTH_RATIO, mapped);
  return Math.max(0.5, tipWidth * ratio);
}

function segmentPathData(a: CanvasPoint, b: CanvasPoint): string {
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * Expand a CanvasPath into one or more SVG stroke segments.
 * Constant-width paths stay a single polyline; pressure-modulated paths
 * become short round-capped segments so paint and erase stay matched.
 */
export function canvasPathToStrokeSegments(
  path: CanvasPath,
  curve: PressureCurve,
  polylineData: (points: CanvasPoint[]) => string,
): StrokeSegment[] {
  const points = path.paths;
  if (points.length === 0) return [];

  if (!pathHasPressureModulation(points) || points.length === 1) {
    const d = polylineData(points);
    return d ? [{ d, strokeWidth: path.strokeWidth }] : [];
  }

  const segments: StrokeSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const pa =
      typeof a.pressure === 'number' && Number.isFinite(a.pressure)
        ? a.pressure
        : 0.5;
    const pb =
      typeof b.pressure === 'number' && Number.isFinite(b.pressure)
        ? b.pressure
        : 0.5;
    segments.push({
      d: segmentPathData(a, b),
      strokeWidth: widthForPressure(path.strokeWidth, (pa + pb) / 2, curve),
    });
  }
  return segments;
}
