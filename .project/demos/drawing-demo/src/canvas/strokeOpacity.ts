/** Clamp brush opacity into a renderable 0–1 range. */
export function clampStrokeOpacity(opacity: number | undefined): number {
  if (typeof opacity !== 'number' || Number.isNaN(opacity)) {
    return 1;
  }
  return Math.min(1, Math.max(0, opacity));
}

/** SVG opacity for a path — erase masks stay fully opaque. */
export function pathStrokeOpacity(path: {
  drawMode: boolean;
  opacity?: number;
}): number | undefined {
  if (!path.drawMode) {
    return undefined;
  }
  const opacity = clampStrokeOpacity(path.opacity);
  return opacity >= 1 ? undefined : opacity;
}
