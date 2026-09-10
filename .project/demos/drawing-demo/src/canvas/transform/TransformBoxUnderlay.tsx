import type { Rect } from '../../authoring/types';
import {
  INFINITE_CANVAS_ORIGIN,
  INFINITE_CANVAS_SIZE,
} from '../viewport';
import {
  resolveUnderlayRects,
  type UnderlayBox,
} from './transformChromeOptions';

const CORNER_RADIUS = 6;

const infiniteViewBox = `${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_SIZE} ${INFINITE_CANVAS_SIZE}`;

export type TransformBoxUnderlayProps = {
  fill: string;
  boxes: UnderlayBox[];
  /** Live resize/move draft rects keyed by box id. */
  draftById?: Map<string, Rect> | null;
  cornerRadius?: number;
};

export function TransformBoxUnderlay({
  fill,
  boxes,
  draftById,
  cornerRadius = CORNER_RADIUS,
}: TransformBoxUnderlayProps) {
  if (boxes.length === 0) {
    return null;
  }

  const displayBoxes = resolveUnderlayRects(boxes, draftById);

  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox={infiniteViewBox}
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      {displayBoxes.map((box) => (
        <rect
          key={box.id}
          x={box.rect.x}
          y={box.rect.y}
          width={box.rect.width}
          height={box.rect.height}
          rx={cornerRadius}
          ry={cornerRadius}
          fill={fill}
          stroke="none"
        />
      ))}
    </svg>
  );
}
