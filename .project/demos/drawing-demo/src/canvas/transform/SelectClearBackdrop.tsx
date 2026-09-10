import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  clearSelection,
  marqueeCandidatesForFocusedSurface,
  nodesOverlappingMarquee,
  normalizeMarqueeRect,
  setSelection,
} from '../../authoring';
import type { AuthoringWorkspace } from '../../authoring/workspace';
import type { SessionStore } from '../../authoring/session';
import type { Rect } from '../../authoring/types';
import {
  INFINITE_CANVAS_ORIGIN,
  INFINITE_CANVAS_SIZE,
  useViewportShell,
} from '../viewport';
import { openSurfaceContextMenuFromEvent } from '../openAuthoringContextMenuFromEvent';

const infiniteViewBox = `${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_SIZE} ${INFINITE_CANVAS_SIZE}`;
const MARQUEE_THRESHOLD_PX = 4;

export type SelectClearBackdropProps = {
  workspace: AuthoringWorkspace;
  /** True when Select is latched (empty-space clears selection / marquee). */
  active: boolean;
};

/**
 * Shared Select empty-space clear for Graph and Canvas.
 * Mount under Node transform chrome so pads/handles receive hits first.
 */
export function applySelectClearBackdrop(
  store: SessionStore,
  active: boolean,
  button: number,
): void {
  if (!active || button !== 0 || store.getState().agentMode) {
    return;
  }
  clearSelection(store);
}

type PendingPointer = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWorldX: number;
  startWorldY: number;
};

export function SelectClearBackdrop({
  workspace,
  active,
}: SelectClearBackdropProps) {
  const { screenToWorld } = useViewportShell();
  const pendingRef = useRef<PendingPointer | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);

  if (!active) {
    return null;
  }

  const finishMarquee = (event: ReactPointerEvent) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending || event.pointerId !== pending.pointerId) {
      return;
    }
    try {
      (event.currentTarget as Element).releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }

    const end = screenToWorld(event.clientX, event.clientY);
    const dx = event.clientX - pending.startClientX;
    const dy = event.clientY - pending.startClientY;
    const dragged = dx * dx + dy * dy > MARQUEE_THRESHOLD_PX * MARQUEE_THRESHOLD_PX;

    if (!dragged) {
      setMarquee(null);
      applySelectClearBackdrop(workspace.sessionStore, active, 0);
      return;
    }

    const rect = normalizeMarqueeRect(
      pending.startWorldX,
      pending.startWorldY,
      end.x,
      end.y,
    );
    setMarquee(null);

    const session = workspace.sessionStore.getState();
    const document = workspace.documentStore.getState();
    const candidates = marqueeCandidatesForFocusedSurface(document, session);
    const refs = nodesOverlappingMarquee(rect, candidates);
    setSelection(workspace.sessionStore, new Set(refs));
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 || workspace.sessionStore.getState().agentMode) {
      return;
    }
    const world = screenToWorld(event.clientX, event.clientY);
    pendingRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWorldX: world.x,
      startWorldY: world.y,
    };
    setMarquee(null);
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const pending = pendingRef.current;
    if (!pending || event.pointerId !== pending.pointerId) {
      return;
    }
    const dx = event.clientX - pending.startClientX;
    const dy = event.clientY - pending.startClientY;
    if (dx * dx + dy * dy <= MARQUEE_THRESHOLD_PX * MARQUEE_THRESHOLD_PX) {
      return;
    }
    const end = screenToWorld(event.clientX, event.clientY);
    setMarquee(
      normalizeMarqueeRect(
        pending.startWorldX,
        pending.startWorldY,
        end.x,
        end.y,
      ),
    );
  };

  const onContextMenu = (event: ReactMouseEvent) => {
    if (workspace.sessionStore.getState().agentMode) {
      return;
    }
    pendingRef.current = null;
    setMarquee(null);
    clearSelection(workspace.sessionStore);
    openSurfaceContextMenuFromEvent(
      event,
      screenToWorld(event.clientX, event.clientY),
    );
  };

  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox={infiniteViewBox}
      style={{ pointerEvents: 'auto' }}
      aria-hidden
      data-select-clear-backdrop
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishMarquee}
      onPointerCancel={() => {
        pendingRef.current = null;
        setMarquee(null);
      }}
      onContextMenu={onContextMenu}
    >
      {marquee && marquee.width + marquee.height > 0 ? (
        <rect
          x={marquee.x}
          y={marquee.y}
          width={marquee.width}
          height={marquee.height}
          fill="rgba(0, 0, 0, 0.04)"
          stroke="rgba(0, 0, 0, 0.3)"
          strokeWidth={1}
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
    </svg>
  );
}
