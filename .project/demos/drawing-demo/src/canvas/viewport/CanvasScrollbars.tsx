import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  EDGE,
  GUTTER,
  canScrollbarStartDrag,
  getWindowGestureSnapshot,
  setContentBusy,
  subscribeWindowGesture,
} from '../../window';
import type { Viewport } from './useCanvasViewport';

type CanvasScrollbarsProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewport: Viewport;
  setViewport: (next: Viewport | ((current: Viewport) => Viewport)) => void;
  worldMinX: number;
  worldMaxX: number;
  worldMinY: number;
  worldMaxY: number;
  /** Extra space reserved below the scrollbar layer (timeline overlay cases). */
  bottomReserve?: number;
};

type DragState = {
  axis: 'x' | 'y';
  startClient: number;
  startThumbOffset: number;
  worldMin: number;
  worldMax: number;
  visibleSpan: number;
  thumbSize: number;
  trackSize: number;
};

const MIN_THUMB_SIZE = 24;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const computeThumb = (
  containerSpan: number,
  viewportOffset: number,
  zoom: number,
  worldMin: number,
  worldMax: number,
) => {
  const trackSize = containerSpan;
  const worldSpan = worldMax - worldMin;
  const visibleSpan = containerSpan / zoom;
  const viewLeft = -viewportOffset / zoom;
  const scrollable = Math.max(worldSpan - visibleSpan, 0.001);
  const scrollPos = clamp(viewLeft - worldMin, 0, scrollable);
  const thumbSize = Math.min(
    trackSize,
    Math.max(MIN_THUMB_SIZE, (visibleSpan / worldSpan) * trackSize),
  );
  const maxThumbOffset = Math.max(trackSize - thumbSize, 0);
  const thumbOffset = (scrollPos / scrollable) * maxThumbOffset;
  return {
    trackSize,
    thumbSize,
    thumbOffset,
    worldMin,
    worldMax,
    visibleSpan,
    canScroll: scrollable > 1,
  };
};

const viewportFromThumb = (
  thumbOffset: number,
  drag: Pick<
    DragState,
    'worldMin' | 'worldMax' | 'visibleSpan' | 'thumbSize' | 'trackSize'
  >,
  zoom: number,
) => {
  const scrollable = drag.worldMax - drag.worldMin - drag.visibleSpan;
  const maxThumbOffset = Math.max(drag.trackSize - drag.thumbSize, 0);
  const scrollPos =
    maxThumbOffset > 0 ? (thumbOffset / maxThumbOffset) * scrollable : 0;
  return -(drag.worldMin + scrollPos) * zoom;
};

/** Alias for viewport shell inset — same as window GUTTER. */
export const CANVAS_SCROLLBAR_SIZE = GUTTER;

export const CanvasScrollbars = ({
  containerRef,
  viewport,
  setViewport,
  worldMinX,
  worldMaxX,
  worldMinY,
  worldMaxY,
  bottomReserve = 0,
}: CanvasScrollbarsProps) => {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  /** True when pointerdown already began a scroll drag on this press (skip mouse). */
  const pointerOwnedThisPressRef = useRef(false);
  const gesture = useSyncExternalStore(
    subscribeWindowGesture,
    getWindowGestureSnapshot,
    getWindowGestureSnapshot,
  );
  const allowScrollbar = canScrollbarStartDrag();
  // Re-read when gesture snapshot changes (subscribe drives re-render).
  void gesture;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  // Window-level move/up so mouse fallback works without pointer capture (PE poison).
  useEffect(() => {
    if (!drag) return;

    const onMove = (clientX: number, clientY: number, buttons: number) => {
      if ((buttons & 1) === 0) {
        setDrag(null);
        setContentBusy('none');
        pointerOwnedThisPressRef.current = false;
        return;
      }
      const delta = (drag.axis === 'x' ? clientX : clientY) - drag.startClient;
      const max = Math.max(drag.trackSize - drag.thumbSize, 0);
      const thumbOffset = clamp(drag.startThumbOffset + delta, 0, max);
      const next = viewportFromThumb(thumbOffset, drag, viewport.zoom);
      if (drag.axis === 'x') setViewport((c) => ({ ...c, x: next }));
      else setViewport((c) => ({ ...c, y: next }));
    };

    const clear = () => {
      setDrag(null);
      setContentBusy('none');
      pointerOwnedThisPressRef.current = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      onMove(event.clientX, event.clientY, event.buttons);
    };
    const onMouseMove = (event: MouseEvent) => {
      onMove(event.clientX, event.clientY, event.buttons);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('pointerup', clear);
    window.addEventListener('pointercancel', clear);
    window.addEventListener('mouseup', clear);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
      window.removeEventListener('mouseup', clear);
    };
  }, [drag, setViewport, viewport.zoom]);

  if (containerSize.width === 0 || containerSize.height === 0) return null;

  const viewLeft = -viewport.x / viewport.zoom;
  const viewRight = viewLeft + containerSize.width / viewport.zoom;
  const viewTop = -viewport.y / viewport.zoom;
  const viewBottom = viewTop + containerSize.height / viewport.zoom;

  const effectiveMinX = Math.min(worldMinX, viewLeft);
  const effectiveMaxX = Math.max(worldMaxX, viewRight);
  const effectiveMinY = Math.min(worldMinY, viewTop);
  const effectiveMaxY = Math.max(worldMaxY, viewBottom);

  const h = computeThumb(
    containerSize.width,
    viewport.x,
    viewport.zoom,
    effectiveMinX,
    effectiveMaxX,
  );
  const v = computeThumb(
    containerSize.height,
    viewport.y,
    viewport.zoom,
    effectiveMinY,
    effectiveMaxY,
  );

  const makeDrag = (
    axis: 'x' | 'y',
    startClient: number,
    startThumbOffset: number,
  ): DragState => {
    const m = axis === 'x' ? h : v;
    return {
      axis,
      startClient,
      startThumbOffset,
      worldMin: m.worldMin,
      worldMax: m.worldMax,
      visibleSpan: m.visibleSpan,
      thumbSize: m.thumbSize,
      trackSize: m.trackSize,
    };
  };

  const apply = (axis: 'x' | 'y', thumbOffset: number, ds: DragState) => {
    const next = viewportFromThumb(thumbOffset, ds, viewport.zoom);
    if (axis === 'x') setViewport((c) => ({ ...c, x: next }));
    else setViewport((c) => ({ ...c, y: next }));
  };

  const beginScrollDrag = (
    ds: DragState,
    capture?: { target: HTMLDivElement; pointerId: number },
  ) => {
    if (!canScrollbarStartDrag()) return false;
    setContentBusy('scroll');
    setDrag(ds);
    if (capture) {
      try {
        capture.target.setPointerCapture(capture.pointerId);
      } catch {
        // Capture can fail after native resize PE poison; window mouse listeners cover it.
      }
    }
    return true;
  };

  const startThumbDrag = (
    axis: 'x' | 'y',
    clientX: number,
    clientY: number,
    capture?: { target: HTMLDivElement; pointerId: number },
  ) => {
    if (!canScrollbarStartDrag()) return;
    const m = axis === 'x' ? h : v;
    const ds = makeDrag(axis, axis === 'x' ? clientX : clientY, m.thumbOffset);
    beginScrollDrag(ds, capture);
  };

  const startTrackDrag = (
    axis: 'x' | 'y',
    clientX: number,
    clientY: number,
    currentTarget: HTMLDivElement,
    capture?: { pointerId: number },
  ) => {
    if (!canScrollbarStartDrag()) return;
    const m = axis === 'x' ? h : v;
    const rect = currentTarget.getBoundingClientRect();
    const clickPos =
      (axis === 'x' ? clientX : clientY) - (axis === 'x' ? rect.left : rect.top);
    const targetOffset = clamp(
      clickPos - m.thumbSize / 2,
      0,
      Math.max(m.trackSize - m.thumbSize, 0),
    );
    const ds = makeDrag(axis, axis === 'x' ? clientX : clientY, targetOffset);
    if (
      !beginScrollDrag(
        ds,
        capture
          ? { target: currentTarget, pointerId: capture.pointerId }
          : undefined,
      )
    ) {
      return;
    }
    apply(axis, targetOffset, ds);
  };

  const handleThumbPointerDown = (
    axis: 'x' | 'y',
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!canScrollbarStartDrag()) return;
    event.preventDefault();
    event.stopPropagation();
    pointerOwnedThisPressRef.current = true;
    startThumbDrag(axis, event.clientX, event.clientY, {
      target: event.currentTarget,
      pointerId: event.pointerId,
    });
  };

  const handleTrackPointerDown = (
    axis: 'x' | 'y',
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!canScrollbarStartDrag()) return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    pointerOwnedThisPressRef.current = true;
    startTrackDrag(axis, event.clientX, event.clientY, event.currentTarget, {
      pointerId: event.pointerId,
    });
  };

  /**
   * Standing mouse fallback (WebKitGTK): after native resize/move, the next
   * pointerdown may be omitted while mousedown still arrives.
   */
  const handleThumbMouseDown = (
    axis: 'x' | 'y',
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    if (pointerOwnedThisPressRef.current) {
      pointerOwnedThisPressRef.current = false;
      return;
    }
    if (!canScrollbarStartDrag()) return;
    event.preventDefault();
    event.stopPropagation();
    startThumbDrag(axis, event.clientX, event.clientY);
  };

  const handleTrackMouseDown = (
    axis: 'x' | 'y',
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    if (pointerOwnedThisPressRef.current) {
      pointerOwnedThisPressRef.current = false;
      return;
    }
    if (!canScrollbarStartDrag()) return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    startTrackDrag(axis, event.clientX, event.clientY, event.currentTarget);
  };

  const thumbCls = 'rounded-full bg-black';
  const trackPointerEvents = allowScrollbar ? 'auto' : 'none';
  /** Interactive strip = gutter − EDGE (outer EDGE is window resize). */
  const interior = GUTTER - EDGE;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10"
      style={{ bottom: bottomReserve }}
    >
      {/* Horizontal: visual full gutter; hit target inset above South EDGE. */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 bg-[rgb(247,247,247)]"
        style={{ right: GUTTER, height: GUTTER }}
      >
        <div
          data-scrollbar=""
          className="absolute left-0 right-0"
          style={{
            bottom: EDGE,
            height: interior,
            pointerEvents: trackPointerEvents,
          }}
          onPointerDown={(e) => h.canScroll && handleTrackPointerDown('x', e)}
          onMouseDown={(e) => h.canScroll && handleTrackMouseDown('x', e)}
        >
          {h.canScroll && (
            <div
              className={`absolute top-1/2 h-2 -translate-y-1/2 cursor-default ${thumbCls}`}
              style={{ left: h.thumbOffset, width: h.thumbSize }}
              onPointerDown={(e) => handleThumbPointerDown('x', e)}
              onMouseDown={(e) => handleThumbMouseDown('x', e)}
            />
          )}
        </div>
      </div>

      {/* Vertical: visual full gutter; hit target inset left of East EDGE. */}
      <div
        className="pointer-events-none absolute right-0 top-0 bg-[rgb(247,247,247)]"
        style={{ bottom: GUTTER, width: GUTTER }}
      >
        <div
          data-scrollbar=""
          className="absolute top-0 bottom-0"
          style={{
            right: EDGE,
            width: interior,
            pointerEvents: trackPointerEvents,
          }}
          onPointerDown={(e) => v.canScroll && handleTrackPointerDown('y', e)}
          onMouseDown={(e) => v.canScroll && handleTrackMouseDown('y', e)}
        >
          {v.canScroll && (
            <div
              className={`absolute left-1/2 w-2 -translate-x-1/2 cursor-default ${thumbCls}`}
              style={{ top: v.thumbOffset, height: v.thumbSize }}
              onPointerDown={(e) => handleThumbPointerDown('y', e)}
              onMouseDown={(e) => handleThumbMouseDown('y', e)}
            />
          )}
        </div>
      </div>

      <div
        className="pointer-events-none absolute bottom-0 right-0 bg-[rgb(247,247,247)]"
        style={{ width: GUTTER, height: GUTTER }}
      />
    </div>
  );
};
