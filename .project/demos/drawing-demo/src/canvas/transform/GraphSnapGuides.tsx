import {
  INFINITE_CANVAS_ORIGIN,
  INFINITE_CANVAS_SIZE,
  useViewportShell,
} from '../viewport';
import type { SnapGuideState } from './graphSnapping';

const infiniteViewBox = `${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_SIZE} ${INFINITE_CANVAS_SIZE}`;

export type GraphSnapGuidesProps = {
  guides: SnapGuideState;
  color: string;
};

export function GraphSnapGuides({ guides, color }: GraphSnapGuidesProps) {
  const { viewport } = useViewportShell();
  const zoom = Math.max(viewport.zoom, 0.001);
  const strokeWidth = Math.max(1 / zoom, 1);

  if (!guides.alignment.length) {
    return null;
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox={infiniteViewBox}
      aria-hidden
    >
      {guides.alignment.map((guide, index) =>
        guide.orientation === 'vertical' ? (
          <line
            key={`snap-v-${index}`}
            x1={guide.position}
            y1={guide.spanStart}
            x2={guide.position}
            y2={guide.spanEnd}
            stroke={color}
            strokeWidth={strokeWidth}
          />
        ) : (
          <line
            key={`snap-h-${index}`}
            x1={guide.spanStart}
            y1={guide.position}
            x2={guide.spanEnd}
            y2={guide.position}
            stroke={color}
            strokeWidth={strokeWidth}
          />
        ),
      )}
    </svg>
  );
}
