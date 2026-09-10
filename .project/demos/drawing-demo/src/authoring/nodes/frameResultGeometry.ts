import type { Rect } from '../types/nodes';

/**
 * Place a Frame result Image: fit width to Frame crop, height from aspect, centered on crop.
 */
export function frameResultImageRect(
  crop: Rect,
  naturalWidth: number,
  naturalHeight: number,
): Rect {
  const cropW = Math.max(1, crop.width);
  const cropH = Math.max(1, crop.height);
  const nw = Math.max(1, naturalWidth);
  const nh = Math.max(1, naturalHeight);
  const width = cropW;
  const height = Math.max(1, width * (nh / nw));
  return {
    x: crop.x + (cropW - width) / 2,
    y: crop.y + (cropH - height) / 2,
    width,
    height,
  };
}
