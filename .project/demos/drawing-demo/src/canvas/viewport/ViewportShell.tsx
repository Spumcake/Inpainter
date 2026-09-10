import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useImperativeHandle,
  type ReactNode,
  type RefObject,
} from 'react';
import { AUTHORING_BOTTOM_RESERVE } from '../../timeline/layout';
import { CANVAS_SCROLLBAR_SIZE, CanvasScrollbars } from './CanvasScrollbars';
import {
  useCanvasViewport,
  worldBounds,
  centerViewportOnRect,
  type Viewport,
} from './useCanvasViewport';

export type ViewportShellHandle = {
  screenToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  viewportCenterWorld: () => { x: number; y: number };
  getViewport: () => Viewport;
  setViewport: (viewport: Viewport) => void;
  centerOnRect: (
    rect: { x: number; y: number; width: number; height: number },
    zoom?: number,
  ) => void;
};

type ViewportShellContextValue = {
  containerRef: RefObject<HTMLDivElement>;
  viewport: Viewport;
  setViewportFree: (next: Viewport | ((current: Viewport) => Viewport)) => void;
  screenToWorld: (clientX: number, clientY: number) => { x: number; y: number };
};

const ViewportShellContext = createContext<ViewportShellContextValue | null>(null);

export const useViewportShell = (): ViewportShellContextValue => {
  const value = useContext(ViewportShellContext);
  if (!value) throw new Error('useViewportShell must be used within ViewportShell');
  return value;
};

type ViewportGridProps = {
  gridColor: string;
  gridOpacity: number;
  gridSize: number;
  viewport: Viewport;
};

const VIEWPORT_SURROUND_CLASS = 'bg-[rgb(247,247,247)]';
const DOCUMENT_SURFACE_CLASS = 'bg-white';

const ViewportGrid = ({
  gridColor,
  gridOpacity,
  gridSize,
  viewport,
}: ViewportGridProps) => {
  const spacing = Math.max(gridSize * viewport.zoom, 1);
  const posX = ((viewport.x % spacing) + spacing) % spacing;
  const posY = ((viewport.y % spacing) + spacing) % spacing;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        opacity: gridOpacity,
        backgroundImage: `radial-gradient(circle, ${gridColor} 1px, transparent 1px)`,
        backgroundSize: `${spacing}px ${spacing}px`,
        backgroundPosition: `${posX}px ${posY}px`,
      }}
    />
  );
};

export type ViewportShellProps = {
  worldWidth: number;
  worldHeight: number;
  onZoomChange: (zoom: number) => void;
  onViewportChange?: (viewport: Viewport) => void;
  initialViewport?: Viewport;
  initialCenterRect?: { x: number; y: number; width: number; height: number };
  initialCenterZoom?: number;
  showGrid?: boolean;
  gridColor?: string;
  gridOpacity?: number;
  gridSize?: number;
  backgroundClassName?: string;
  containerCursor?: string;
  worldClassName?: string;
  showWorldBorder?: boolean;
  paneClassName?: string;
  panOnDrag?: boolean;
  infiniteCanvas?: boolean;
  overlay?: ReactNode;
  /**
   * Extra space reserved below the pane / scrollbars, in addition to the
   * scrollbar gutter. Flex-docked timeline already occupies its own row, so
   * this defaults to AUTHORING_BOTTOM_RESERVE (0).
   */
  bottomReserve?: number;
  children: ReactNode;
};

export const ViewportShell = forwardRef<ViewportShellHandle, ViewportShellProps>(
  function ViewportShell(
    {
      worldWidth,
      worldHeight,
      onZoomChange,
      onViewportChange,
      initialViewport,
      initialCenterRect,
      initialCenterZoom,
      showGrid = false,
      gridColor = '#FFFFFF',
      gridOpacity = 0.1,
      gridSize = 24,
      backgroundClassName = VIEWPORT_SURROUND_CLASS,
      containerCursor,
      worldClassName = DOCUMENT_SURFACE_CLASS,
      showWorldBorder = true,
      paneClassName = '',
      panOnDrag = false,
      infiniteCanvas = false,
      overlay,
      bottomReserve = AUTHORING_BOTTOM_RESERVE,
      children,
    },
    ref,
  ) {
    const {
      containerRef,
      viewport,
      setViewport,
      setViewportFree,
      isPanning,
      handleContainerPointerDown,
      handleContainerPointerMove,
      handleContainerPointerUp,
    } = useCanvasViewport({
      docWidth: worldWidth,
      docHeight: worldHeight,
      onZoomChange,
      onViewportChange,
      initialViewport,
      initialCenterRect,
      initialCenterZoom,
      panOnDrag,
      infiniteCanvas,
    });

    const screenToWorld = useCallback(
      (clientX: number, clientY: number) => {
        const el = containerRef.current;
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        return {
          x: (clientX - rect.left - viewport.x) / viewport.zoom,
          y: (clientY - rect.top - viewport.y) / viewport.zoom,
        };
      },
      [containerRef, viewport.x, viewport.y, viewport.zoom],
    );

    const viewportCenterWorld = useCallback(() => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, [containerRef, screenToWorld]);

    const centerOnRect = useCallback(
      (
        rect: { x: number; y: number; width: number; height: number },
        zoom?: number,
      ) => {
        const el = containerRef.current;
        if (!el) return;
        const next = centerViewportOnRect(
          el.clientWidth,
          el.clientHeight,
          rect,
          zoom ?? viewport.zoom,
        );
        if (infiniteCanvas) setViewportFree(next);
        else setViewport(next);
      },
      [containerRef, infiniteCanvas, setViewport, setViewportFree, viewport.zoom],
    );

    useImperativeHandle(
      ref,
      () => ({
        screenToWorld,
        viewportCenterWorld,
        getViewport: () => viewport,
        setViewport,
        centerOnRect,
      }),
      [centerOnRect, screenToWorld, viewportCenterWorld, setViewport, viewport],
    );

    const homeBounds = {
      minX: worldBounds(worldWidth).min,
      maxX: worldBounds(worldWidth).max,
      minY: worldBounds(worldHeight).min,
      maxY: worldBounds(worldHeight).max,
    };

    const resolvedCursor =
      containerCursor ?? (isPanning ? 'grabbing' : panOnDrag ? 'grab' : 'default');

    return (
      <ViewportShellContext.Provider
        value={{ containerRef, viewport, setViewportFree, screenToWorld }}
      >
        <div className={`relative flex-1 overflow-hidden ${backgroundClassName}`}>
          <div
            ref={containerRef}
            className={`absolute left-0 top-0 select-none overflow-hidden ${VIEWPORT_SURROUND_CLASS} ${paneClassName}`}
            style={{
              right: CANVAS_SCROLLBAR_SIZE,
              bottom: CANVAS_SCROLLBAR_SIZE + bottomReserve,
              cursor: resolvedCursor,
            }}
            onPointerDown={handleContainerPointerDown}
            onPointerMove={handleContainerPointerMove}
            onPointerUp={handleContainerPointerUp}
            onPointerLeave={handleContainerPointerUp}
            onPointerCancel={handleContainerPointerUp}
            onContextMenu={(event) => event.preventDefault()}
          >
            {showGrid && (
              <ViewportGrid
                gridColor={gridColor}
                gridOpacity={gridOpacity}
                gridSize={gridSize}
                viewport={viewport}
              />
            )}
            <div
              className="absolute left-0 top-0 z-[1] origin-top-left"
              style={{
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
              }}
            >
              {infiniteCanvas ? (
                <div className="relative">{children}</div>
              ) : (
                <div
                  className={`relative ${worldClassName ?? ''} ${showWorldBorder ? 'shadow-[0_0_0_1px_rgba(209,213,219,1)]' : ''}`}
                  style={{ width: worldWidth, height: worldHeight }}
                >
                  {children}
                </div>
              )}
              {overlay}
            </div>
          </div>

          <CanvasScrollbars
            containerRef={containerRef}
            viewport={viewport}
            setViewport={setViewportFree}
            worldMinX={homeBounds.minX}
            worldMaxX={homeBounds.maxX}
            worldMinY={homeBounds.minY}
            worldMaxY={homeBounds.maxY}
            bottomReserve={bottomReserve}
          />
        </div>
      </ViewportShellContext.Provider>
    );
  },
);
