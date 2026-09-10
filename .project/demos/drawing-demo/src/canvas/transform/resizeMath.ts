import type { Rect } from '../../authoring/types';

export type ResizeHandle =
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw';

export const RESIZE_HANDLES: ResizeHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';
export type ResizeEdge = 'n' | 'e' | 's' | 'w';

/** Visible corner knobs for transform chrome. */
export const CORNER_HANDLES: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];

/** Invisible full-edge hit strips for transform chrome. */
export const EDGE_HANDLES: ResizeEdge[] = ['n', 'e', 's', 'w'];

/**
 * Axis-aligned square for a corner knob placed flush inside the box.
 * `inset` pulls the knob in from the geometric rect (e.g. half stroke so it
 * sits against the inner edge of a centered outline).
 */
export function cornerHandleRect(
  rect: Rect,
  corner: ResizeCorner,
  handleSize: number,
  inset = 0,
): Rect {
  const maxInsetX = Math.max(0, (rect.width - handleSize) / 2);
  const maxInsetY = Math.max(0, (rect.height - handleSize) / 2);
  const ix = Math.min(Math.max(0, inset), maxInsetX);
  const iy = Math.min(Math.max(0, inset), maxInsetY);
  switch (corner) {
    case 'nw':
      return { x: rect.x + ix, y: rect.y + iy, width: handleSize, height: handleSize };
    case 'ne':
      return {
        x: rect.x + rect.width - handleSize - ix,
        y: rect.y + iy,
        width: handleSize,
        height: handleSize,
      };
    case 'sw':
      return {
        x: rect.x + ix,
        y: rect.y + rect.height - handleSize - iy,
        width: handleSize,
        height: handleSize,
      };
    case 'se':
      return {
        x: rect.x + rect.width - handleSize - ix,
        y: rect.y + rect.height - handleSize - iy,
        width: handleSize,
        height: handleSize,
      };
  }
}

/**
 * Rectangular mid-edge knob centered on the outline path (sits in the stroke
 * line). N/S are horizontal bars; E/W are vertical bars.
 */
export function edgeHandleRect(
  rect: Rect,
  edge: ResizeEdge,
  thickness: number,
  length: number,
): Rect {
  switch (edge) {
    case 'n': {
      const w = Math.min(length, Math.max(thickness, rect.width));
      return {
        x: rect.x + (rect.width - w) / 2,
        y: rect.y - thickness / 2,
        width: w,
        height: thickness,
      };
    }
    case 's': {
      const w = Math.min(length, Math.max(thickness, rect.width));
      return {
        x: rect.x + (rect.width - w) / 2,
        y: rect.y + rect.height - thickness / 2,
        width: w,
        height: thickness,
      };
    }
    case 'w': {
      const h = Math.min(length, Math.max(thickness, rect.height));
      return {
        x: rect.x - thickness / 2,
        y: rect.y + (rect.height - h) / 2,
        width: thickness,
        height: h,
      };
    }
    case 'e': {
      const h = Math.min(length, Math.max(thickness, rect.height));
      return {
        x: rect.x + rect.width - thickness / 2,
        y: rect.y + (rect.height - h) / 2,
        width: thickness,
        height: h,
      };
    }
  }
}

/**
 * Full-edge hit strip centered on the given edge (ComfyDraw / widget-details layout).
 * N/S span full width; E/W span full height; thickness = stripSize.
 */
export function edgeStripRect(
  rect: Rect,
  edge: ResizeEdge,
  stripSize: number,
): Rect {
  const half = stripSize / 2;
  switch (edge) {
    case 'n':
      return {
        x: rect.x,
        y: rect.y - half,
        width: rect.width,
        height: stripSize,
      };
    case 's':
      return {
        x: rect.x,
        y: rect.y + rect.height - half,
        width: rect.width,
        height: stripSize,
      };
    case 'w':
      return {
        x: rect.x - half,
        y: rect.y,
        width: stripSize,
        height: rect.height,
      };
    case 'e':
      return {
        x: rect.x + rect.width - half,
        y: rect.y,
        width: stripSize,
        height: rect.height,
      };
  }
}

/** Translate a rect by a world-space drag delta (move). */
export function applyMoveDelta(start: Rect, dx: number, dy: number): Rect {
  return {
    x: start.x + dx,
    y: start.y + dy,
    width: start.width,
    height: start.height,
  };
}

/**
 * Uniform scale from a mid-edge handle — preserves aspect ratio (no stretch/squash).
 * Opposite edge stays anchored; the dragged edge drives the scale factor.
 */
export function applyUniformEdgeResizeDelta(
  start: Rect,
  edge: ResizeEdge,
  dx: number,
  dy: number,
): Rect {
  const min = 1;
  const { x, y, width: w0, height: h0 } = start;
  if (w0 <= 0 || h0 <= 0) {
    return { ...start };
  }
  const minScale = Math.max(min / w0, min / h0);

  switch (edge) {
    case 'e': {
      const scale = Math.max(minScale, (w0 + dx) / w0);
      const width = w0 * scale;
      const height = h0 * scale;
      return { x, y, width, height };
    }
    case 'w': {
      const scale = Math.max(minScale, (w0 - dx) / w0);
      const width = w0 * scale;
      const height = h0 * scale;
      return { x: x + w0 - width, y, width, height };
    }
    case 's': {
      const scale = Math.max(minScale, (h0 + dy) / h0);
      const width = w0 * scale;
      const height = h0 * scale;
      return { x, y, width, height };
    }
    case 'n': {
      const scale = Math.max(minScale, (h0 - dy) / h0);
      const width = w0 * scale;
      const height = h0 * scale;
      return { x, y: y + h0 - height, width, height };
    }
  }
}

/**
 * Uniform aspect-locked resize anchored at rect center (Output chrome).
 * Returns the next display rect; caller maps to relativeScale vs host.
 */
export function applyCenterUniformEdgeResizeDelta(
  start: Rect,
  edge: ResizeEdge,
  dx: number,
  dy: number,
): Rect {
  const min = 1;
  const { width: w0, height: h0 } = start;
  if (w0 <= 0 || h0 <= 0) {
    return { ...start };
  }
  const minScale = Math.max(min / w0, min / h0);
  let scale = 1;
  switch (edge) {
    case 'e':
      scale = Math.max(minScale, (w0 + 2 * dx) / w0);
      break;
    case 'w':
      scale = Math.max(minScale, (w0 - 2 * dx) / w0);
      break;
    case 's':
      scale = Math.max(minScale, (h0 + 2 * dy) / h0);
      break;
    case 'n':
      scale = Math.max(minScale, (h0 - 2 * dy) / h0);
      break;
  }
  const width = w0 * scale;
  const height = h0 * scale;
  const cx = start.x + w0 / 2;
  const cy = start.y + h0 / 2;
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  };
}

/** Apply a world-space drag delta to a rect from the given handle (independent axes). */
export function applyResizeHandleDelta(
  start: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
): Rect {
  let { x, y, width, height } = start;
  const min = 1;

  if (handle.includes('e')) {
    width = Math.max(min, start.width + dx);
  }
  if (handle.includes('w')) {
    const nextWidth = Math.max(min, start.width - dx);
    x = start.x + start.width - nextWidth;
    width = nextWidth;
  }
  if (handle.includes('s')) {
    height = Math.max(min, start.height + dy);
  }
  if (handle.includes('n')) {
    const nextHeight = Math.max(min, start.height - dy);
    y = start.y + start.height - nextHeight;
    height = nextHeight;
  }

  return { x, y, width, height };
}

/** Expand a rect by a uniform world-space pad (hit target around the outline). */
export function expandRect(rect: Rect, pad: number): Rect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

export function handleCenter(rect: Rect, handle: ResizeHandle): { x: number; y: number } {
  const { x, y, width, height } = rect;
  switch (handle) {
    case 'nw':
      return { x, y };
    case 'n':
      return { x: x + width / 2, y };
    case 'ne':
      return { x: x + width, y };
    case 'e':
      return { x: x + width, y: y + height / 2 };
    case 'se':
      return { x: x + width, y: y + height };
    case 's':
      return { x: x + width / 2, y: y + height };
    case 'sw':
      return { x, y: y + height };
    case 'w':
      return { x, y: y + height / 2 };
  }
}

export function handleCursor(handle: ResizeHandle): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
  }
}

/** Scale factors from baseRect into draftRect (same ratios as contentsPreviewMatrix). */
export function contentsPreviewScale(
  baseRect: Rect,
  draftRect: Rect,
): { sx: number; sy: number } {
  return {
    sx: baseRect.width === 0 ? 1 : draftRect.width / baseRect.width,
    sy: baseRect.height === 0 ? 1 : draftRect.height / baseRect.height,
  };
}

/**
 * Remount key for erase SVG masks under CSS scale.
 * Include draft sx/sy during Select transform preview; zoom alone for normal bands.
 */
export function buildMaskRevision(input: {
  zoom: number;
  sx: number;
  sy: number;
}): string {
  return `${input.zoom.toFixed(4)}-${input.sx.toFixed(3)}-${input.sy.toFixed(3)}`;
}

/** CSS matrix for previewing contents scaled from baseRect into draftRect (plane space). */
export function contentsPreviewMatrix(
  baseRect: Rect,
  draftRect: Rect,
  canvasOrigin: number,
): string {
  const { sx, sy } = contentsPreviewScale(baseRect, draftRect);
  const tx =
    draftRect.x - sx * baseRect.x + canvasOrigin * (sx - 1);
  const ty =
    draftRect.y - sy * baseRect.y + canvasOrigin * (sy - 1);
  return `matrix(${sx}, 0, 0, ${sy}, ${tx}, ${ty})`;
}
