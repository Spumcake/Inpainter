import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Rect } from '../../authoring/types';
import {
  INFINITE_CANVAS_ORIGIN,
  INFINITE_CANVAS_SIZE,
  useViewportShell,
} from '../viewport';
import {
  computeCreateRectSnap,
  emptySnapGuides,
  type SnapGuideState,
} from '../transform';
import {
  isMeaningfulCreateRect,
  rectAtPointWithSize,
  rectFromDragPoints,
  rectFromDragPointsAspectLocked,
  type AspectRatioParts,
} from './createMath';

const DRAFT_STROKE_PX = 1.5;

const infiniteViewBox = `${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_SIZE} ${INFINITE_CANVAS_SIZE}`;

type DragState = {
  startWorld: { x: number; y: number };
  pointerId: number;
};

export type CreateRectGestureProps = {
  active: boolean;
  onCommit: (rect: Rect) => void;
  /** When set, drag preview/commit locks to this W:H ratio. */
  aspectRatio?: AspectRatioParts;
  /**
   * When set with `aspectRatio`, a click / tiny drag commits this size at the
   * pointer start instead of ignoring the gesture.
   */
  defaultSize?: { width: number; height: number };
  /** Optional edge snap against peer rects (Graph Frame create). */
  getSnapCandidates?: () => Rect[];
  onSnapGuidesChange?: (guides: SnapGuideState) => void;
};

/**
 * Shared drag-to-create rectangle gesture (world space).
 * Callers supply Document Commands in onCommit — this module stays view-only.
 */
export function CreateRectGesture({
  active,
  onCommit,
  aspectRatio,
  defaultSize,
  getSnapCandidates,
  onSnapGuidesChange,
}: CreateRectGestureProps) {
  const { viewport, screenToWorld } = useViewportShell();
  const zoom = Math.max(viewport.zoom, 0.001);
  const strokeWidth = DRAFT_STROKE_PX / zoom;

  const [draft, setDraft] = useState<Rect | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const getSnapCandidatesRef = useRef(getSnapCandidates);
  getSnapCandidatesRef.current = getSnapCandidates;
  const onSnapGuidesChangeRef = useRef(onSnapGuidesChange);
  onSnapGuidesChangeRef.current = onSnapGuidesChange;

  if (!active) {
    return null;
  }

  const buildRawRect = (
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): Rect => {
    if (aspectRatio) {
      return rectFromDragPointsAspectLocked(start, end, aspectRatio);
    }
    return rectFromDragPoints(start, end);
  };

  const snapRect = (
    raw: Rect,
    start: { x: number; y: number },
  ): Rect => {
    const getCandidates = getSnapCandidatesRef.current;
    if (!getCandidates) {
      return raw;
    }
    const snapped = computeCreateRectSnap(raw, start, getCandidates(), {
      zoom: viewport.zoom,
    });
    onSnapGuidesChangeRef.current?.(snapped.guides);
    return snapped.bounds;
  };

  const clearSnapGuides = () => {
    onSnapGuidesChangeRef.current?.(emptySnapGuides());
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const world = screenToWorld(event.clientX, event.clientY);
    dragRef.current = {
      startWorld: world,
      pointerId: event.pointerId,
    };
    setDraft(snapRect(buildRawRect(world, world), world));
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const world = screenToWorld(event.clientX, event.clientY);
    setDraft(snapRect(buildRawRect(drag.startWorld, world), drag.startWorld));
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    try {
      (event.currentTarget as Element).releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    const world = screenToWorld(event.clientX, event.clientY);
    const rect = snapRect(buildRawRect(drag.startWorld, world), drag.startWorld);
    dragRef.current = null;
    setDraft(null);
    clearSnapGuides();
    if (isMeaningfulCreateRect(rect)) {
      onCommit(rect);
      return;
    }
    if (defaultSize) {
      const placed = snapRect(
        rectAtPointWithSize(drag.startWorld, defaultSize),
        drag.startWorld,
      );
      clearSnapGuides();
      onCommit(placed);
    }
  };

  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox={infiniteViewBox}
      style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {draft ? (
        <rect
          x={draft.x}
          y={draft.y}
          width={draft.width}
          height={draft.height}
          fill="rgba(55, 65, 81, 0.06)"
          stroke="rgba(55, 65, 81, 0.7)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${8 / zoom} ${4 / zoom}`}
        />
      ) : null}
    </svg>
  );
}
