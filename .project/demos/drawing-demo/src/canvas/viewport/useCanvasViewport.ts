import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { canContentGestureStart } from '../../window';

export type Viewport = { x: number; y: number; zoom: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
/** Default zoom on first open — also update useState/viewportRef defaults below. */
export const DEFAULT_ZOOM = 0.6;
const WHEEL_LINE_HEIGHT = 16;
const WHEEL_PIXEL_SENSITIVITY = 0.4;
const WORLD_HALF_MULTIPLIER = 2;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const worldBounds = (docSpan: number) => {
  const half = docSpan * WORLD_HALF_MULTIPLIER;
  return { min: docSpan / 2 - half, max: docSpan / 2 + half };
};

const wheelDeltaToPixels = (delta: number, deltaMode: number, pageSpan: number) => {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * WHEEL_LINE_HEIGHT;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * pageSpan;
  return delta * WHEEL_PIXEL_SENSITIVITY;
};

export const centerViewport = (
  containerWidth: number,
  containerHeight: number,
  docWidth: number,
  docHeight: number,
  zoom: number = DEFAULT_ZOOM,
): Viewport => ({
  x: (containerWidth - docWidth * zoom) / 2,
  y: (containerHeight - docHeight * zoom) / 2,
  zoom,
});

export const centerViewportOnRect = (
  containerWidth: number,
  containerHeight: number,
  rect: { x: number; y: number; width: number; height: number },
  zoom: number = DEFAULT_ZOOM,
): Viewport => ({
  x: containerWidth / 2 - (rect.x + rect.width / 2) * zoom,
  y: containerHeight / 2 - (rect.y + rect.height / 2) * zoom,
  zoom,
});

export const centerViewportOnOrigin = (
  containerWidth: number,
  containerHeight: number,
  zoom: number = DEFAULT_ZOOM,
): Viewport => ({
  x: containerWidth / 2,
  y: containerHeight / 2,
  zoom,
});

/**
 * Keep the world point under the previous viewport center fixed when the
 * container size changes. Zoom is unchanged. Does not clamp to home bounds.
 */
export const reflowViewportToCenter = (
  prev: Viewport,
  prevWidth: number,
  prevHeight: number,
  nextWidth: number,
  nextHeight: number,
): Viewport => {
  if (prevWidth <= 0 || prevHeight <= 0 || nextWidth <= 0 || nextHeight <= 0) {
    return prev;
  }
  if (prevWidth === nextWidth && prevHeight === nextHeight) return prev;
  const worldX = (prevWidth / 2 - prev.x) / prev.zoom;
  const worldY = (prevHeight / 2 - prev.y) / prev.zoom;
  return {
    x: nextWidth / 2 - worldX * prev.zoom,
    y: nextHeight / 2 - worldY * prev.zoom,
    zoom: prev.zoom,
  };
};

type UseCanvasViewportOptions = {
  docWidth: number;
  docHeight: number;
  onZoomChange: (zoom: number) => void;
  onViewportChange?: (viewport: Viewport) => void;
  initialViewport?: Viewport;
  initialCenterRect?: { x: number; y: number; width: number; height: number };
  /** Zoom used with `initialCenterRect` (defaults to DEFAULT_ZOOM). */
  initialCenterZoom?: number;
  panOnDrag?: boolean;
  infiniteCanvas?: boolean;
};

export function useCanvasViewport({
  docWidth,
  docHeight,
  onZoomChange,
  onViewportChange,
  initialViewport,
  initialCenterRect,
  initialCenterZoom,
  panOnDrag = false,
  infiniteCanvas = false,
}: UseCanvasViewportOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: DEFAULT_ZOOM });
  const didInitRef = useRef(false);
  const [viewport, setViewportState] = useState<Viewport>({
    x: 0,
    y: 0,
    zoom: DEFAULT_ZOOM,
  });
  const [isPanning, setIsPanning] = useState(false);

  const applyViewport = useCallback(
    (next: Viewport | ((current: Viewport) => Viewport), clampToHome: boolean) => {
      setViewportState((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        const zoom = clamp(resolved.zoom, MIN_ZOOM, MAX_ZOOM);
        let x = resolved.x;
        let y = resolved.y;

        if (clampToHome) {
          const wx = worldBounds(docWidth);
          const wy = worldBounds(docHeight);
          const el = containerRef.current;
          const cw = el?.clientWidth ?? 0;
          const ch = el?.clientHeight ?? 0;
          const minX = -(wx.max - cw / zoom) * zoom;
          const maxX = -wx.min * zoom;
          const minY = -(wy.max - ch / zoom) * zoom;
          const maxY = -wy.min * zoom;
          x = clamp(resolved.x, Math.min(minX, maxX), maxX);
          y = clamp(resolved.y, Math.min(minY, maxY), maxY);
        }

        const bounded: Viewport = { x, y, zoom };
        viewportRef.current = bounded;
        onViewportChange?.(bounded);
        return bounded;
      });
    },
    [docHeight, docWidth, onViewportChange],
  );

  const setViewport = useCallback(
    (next: Viewport | ((current: Viewport) => Viewport)) => applyViewport(next, true),
    [applyViewport],
  );

  const setViewportFree = useCallback(
    (next: Viewport | ((current: Viewport) => Viewport)) => applyViewport(next, false),
    [applyViewport],
  );

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    onZoomChange(viewport.zoom);
  }, [onZoomChange, viewport.zoom]);

  useLayoutEffect(() => {
    if (didInitRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    didInitRef.current = true;
    if (initialViewport) {
      setViewport(initialViewport);
      return;
    }
    if (infiniteCanvas) {
      if (initialCenterRect) {
        setViewportFree(
          centerViewportOnRect(
            el.clientWidth,
            el.clientHeight,
            initialCenterRect,
            initialCenterZoom != null && initialCenterZoom > 0
              ? initialCenterZoom
              : DEFAULT_ZOOM,
          ),
        );
      } else {
        setViewportFree(centerViewportOnOrigin(el.clientWidth, el.clientHeight));
      }
      return;
    }
    setViewport(centerViewport(el.clientWidth, el.clientHeight, docWidth, docHeight));
  }, [
    docWidth,
    docHeight,
    infiniteCanvas,
    initialCenterRect,
    initialCenterZoom,
    initialViewport,
    setViewport,
    setViewportFree,
  ]);

  // After init: keep world center stable when the container is resized.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let prevW = el.clientWidth;
    let prevH = el.clientHeight;

    const observer = new ResizeObserver(() => {
      if (!didInitRef.current) return;
      const nextW = el.clientWidth;
      const nextH = el.clientHeight;
      if (nextW === prevW && nextH === prevH) return;
      const next = reflowViewportToCenter(viewportRef.current, prevW, prevH, nextW, nextH);
      prevW = nextW;
      prevH = nextH;
      setViewportFree(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [setViewportFree]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = viewportRef.current;

      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        const nextZoom = clamp(current.zoom * Math.exp(-event.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM);
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const flowX = (pointerX - current.x) / current.zoom;
        const flowY = (pointerY - current.y) / current.zoom;
        setViewportFree({
          x: pointerX - flowX * nextZoom,
          y: pointerY - flowY * nextZoom,
          zoom: Number(nextZoom.toFixed(3)),
        });
        return;
      }

      if (event.shiftKey) {
        const raw = event.deltaX !== 0 ? event.deltaX : event.deltaY;
        const delta = wheelDeltaToPixels(raw, event.deltaMode, el.clientWidth);
        setViewportFree({ ...current, x: current.x - delta });
        return;
      }

      const deltaY = wheelDeltaToPixels(event.deltaY, event.deltaMode, el.clientHeight);
      setViewportFree({ ...current, y: current.y - deltaY });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [setViewportFree]);

  const pointerToCanvas = useCallback(
    (clientX: number, clientY: number, pressure = 0.5) => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0, pressure, time: performance.now() };
      const rect = el.getBoundingClientRect();
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom,
        pressure,
        time: performance.now(),
      };
    },
    [viewport],
  );

  const handleContainerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button === 1 || (panOnDrag && event.button === 0)) {
        if (!canContentGestureStart()) return;
        event.preventDefault();
        setIsPanning(true);
      }
    },
    [panOnDrag],
  );

  const handleContainerPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isPanning) {
        setViewportFree((current) => ({
          ...current,
          x: current.x + event.movementX,
          y: current.y + event.movementY,
        }));
      }
    },
    [isPanning, setViewportFree],
  );

  const handleContainerPointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  return {
    containerRef: containerRef as RefObject<HTMLDivElement>,
    viewport,
    setViewport,
    setViewportFree,
    isPanning,
    pointerToCanvas,
    handleContainerPointerDown,
    handleContainerPointerMove,
    handleContainerPointerUp,
  };
}
