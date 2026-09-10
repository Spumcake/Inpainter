import type { Rect } from '../../authoring/types';
import {
  INFINITE_CANVAS_ORIGIN,
  INFINITE_CANVAS_SIZE,
} from '../viewport';

const CORNER_RADIUS = 6;

/** Faint exterior dim so Frame crop stays readable over content. */
export const FRAME_CROP_DIM_FILL = 'rgba(0, 0, 0, 0.08)';

export type FrameCropDimProps = {
  /** Viewable Frame crop in world space (clear hole). */
  crop: Rect;
  fill?: string;
  cornerRadius?: number;
};

/**
 * Outside-crop dim via crop-sized element + large box-shadow (no giant SVG).
 * Stack above Images / Sketch ink; `pointer-events: none`.
 */
export function FrameCropDim({
  crop,
  fill = FRAME_CROP_DIM_FILL,
  cornerRadius = CORNER_RADIUS,
}: FrameCropDimProps) {
  const w = Math.max(1, crop.width);
  const h = Math.max(1, crop.height);
  const r = Math.min(cornerRadius, w / 2, h / 2);

  return (
    <div
      aria-hidden
      className="absolute max-w-none"
      style={{
        left: crop.x - INFINITE_CANVAS_ORIGIN,
        top: crop.y - INFINITE_CANVAS_ORIGIN,
        width: w,
        height: h,
        borderRadius: r,
        boxShadow: `0 0 0 ${INFINITE_CANVAS_SIZE}px ${fill}`,
        pointerEvents: 'none',
      }}
    />
  );
}
