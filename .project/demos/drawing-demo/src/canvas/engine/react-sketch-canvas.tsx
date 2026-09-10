import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { resolveStylusPreferences } from '../../settings/resolveStylusPreferences';
import {
  canStrokeStart,
  getWindowGestureSnapshot,
  setContentBusy,
  subscribeWindowGesture,
} from '../../window';
import { getFreshStylusPressure } from '../../window/stylusPressureBridge';
import { buildChronologicalPathLayers } from '../chronologicalPaths';
import {
  eraseCompositedLayersToSvgMarkup,
  renderEraseCompositedLayers,
} from '../eraseCompositing';
import { clonePaths, pathData } from '../pathUtils';
import { canvasPathToStrokeSegments } from '../pressureStroke';
import { clampStrokeOpacity, pathStrokeOpacity } from '../strokeOpacity';
import { useViewportShell } from '../viewport';
import type { CanvasPath, CanvasPoint } from './types';

function pressureFromPointerEvent(event: PointerEvent): number | undefined {
  if (event.pointerType === 'mouse') return undefined;
  if (event.pointerType !== 'pen' && event.pointerType !== 'touch') {
    return undefined;
  }
  const pressure = event.pressure;
  if (!Number.isFinite(pressure)) return undefined;
  return Math.min(1, Math.max(0, pressure));
}

/** Prefer native tray GDK sample (Linux/WebKitGTK); else PE pressure when available. */
function resolveStrokePressure(event?: PointerEvent): number | undefined {
  const native = getFreshStylusPressure();
  if (native !== undefined) return native;
  if (!event) return undefined;
  return pressureFromPointerEvent(event);
}

export type ExportImageType = 'jpeg' | 'png';
export type { CanvasPath, CanvasPoint as Point } from './types';

export type EraserMode = 'path' | 'mask';

export interface ReactSketchCanvasRef {
  eraseMode: (erase: boolean) => void;
  clearCanvas: () => void;
  resetCanvas: () => void;
  undo: () => void;
  redo: () => void;
  exportImage: (imageType: ExportImageType) => Promise<string>;
  exportSvg: () => Promise<string>;
  exportPaths: () => Promise<CanvasPath[]>;
  loadPaths: (paths: CanvasPath[]) => void;
  getSketchingTime: () => Promise<number>;
}

type ReactSketchCanvasProps = {
  id?: string;
  width?: string | number;
  height?: string | number;
  viewBoxMinX?: number;
  viewBoxMinY?: number;
  className?: string;
  style?: React.CSSProperties;
  canvasColor?: string;
  backgroundImage?: string;
  strokeColor?: string;
  strokeWidth?: number;
  /** 0–1 paint opacity for new draw strokes. */
  strokeOpacity?: number;
  eraserWidth?: number;
  eraserMode?: EraserMode;
  /**
   * When true, new strokes are erase (drawMode false). Mirrored into eraseRef
   * on every render so remounts (e.g. paint-target Sketch band change) cannot
   * leave the engine stuck in paint while Session still has erase latched.
   */
  eraseActive?: boolean;
  allowOnlyPointerType?: 'all' | 'mouse' | 'pen' | 'touch';
  withTimestamp?: boolean;
  onChange?: (paths: CanvasPath[]) => void;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const pathsToSvgMarkup = (
  paths: CanvasPath[],
  eraserMode: EraserMode = 'mask',
) => {
  if (eraserMode !== 'mask') {
    const curve = resolveStylusPreferences();
    return paths
      .map((path) => {
        const opacity = pathStrokeOpacity(path);
        const opacityAttr =
          opacity === undefined ? '' : ` opacity="${opacity}"`;
        const stroke = path.drawMode ? path.strokeColor : '#FFFFFF';
        return canvasPathToStrokeSegments(path, curve, pathData)
          .map(
            (segment) =>
              `<path d="${segment.d}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${segment.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${opacityAttr} />`,
          )
          .join('\n');
      })
      .join('\n');
  }

  return eraseCompositedLayersToSvgMarkup(buildChronologicalPathLayers(paths));
};

const SvgPaths = ({
  paths,
  eraserMode,
  maskRevision,
}: {
  paths: CanvasPath[];
  eraserMode: EraserMode;
  maskRevision: string;
}) => {
  if (eraserMode !== 'mask') {
    const curve = resolveStylusPreferences();
    return (
      <>
        {paths.map((path, index) => {
          const opacity = pathStrokeOpacity(path);
          const stroke = path.drawMode ? path.strokeColor : '#FFFFFF';
          return canvasPathToStrokeSegments(path, curve, pathData).map(
            (segment, segmentIndex) => (
              <path
                key={`${index}-${segmentIndex}`}
                d={segment.d}
                fill="none"
                stroke={stroke}
                strokeWidth={segment.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
              />
            ),
          );
        })}
      </>
    );
  }

  return (
    <>
      {renderEraseCompositedLayers(
        buildChronologicalPathLayers(paths),
        'rsc',
        undefined,
        maskRevision,
      )}
    </>
  );
};

export const ReactSketchCanvas = forwardRef<ReactSketchCanvasRef, ReactSketchCanvasProps>(
  function ReactSketchCanvas(
    {
      id = 'react-sketch-canvas',
      width = '100%',
      height = '100%',
      viewBoxMinX = 0,
      viewBoxMinY = 0,
      className,
      style,
      canvasColor = 'transparent',
      backgroundImage,
      strokeColor = '#000000',
      strokeWidth = 4,
      strokeOpacity = 1,
      eraserWidth = 8,
      eraserMode = 'path',
      eraseActive = false,
      allowOnlyPointerType = 'all',
      withTimestamp = false,
      onChange,
    },
    ref,
  ) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const eraseRef = useRef(eraseActive);
    // Prop is source of truth — must sync during render, not only via effect,
    // so a remounted engine cannot accept a paint stroke before layout effects.
    eraseRef.current = eraseActive;
    const pointerIdRef = useRef<number | null>(null);
    const pathsRef = useRef<CanvasPath[]>([]);
    const draftRef = useRef<CanvasPath | null>(null);
    const withTimestampRef = useRef(withTimestamp);
    const onChangeRef = useRef(onChange);
    const brushRef = useRef({
      strokeColor,
      strokeWidth,
      strokeOpacity: clampStrokeOpacity(strokeOpacity),
      eraserWidth,
    });
    const [paths, setPaths] = useState<CanvasPath[]>([]);
    const [draft, setDraft] = useState<CanvasPath | null>(null);
    const paintOpacity = clampStrokeOpacity(strokeOpacity);
    // Remount path projection on zoom so WebKit re-rasterizes erase masks.
    // Do not remount the whole engine (would drop an in-progress stroke).
    const { viewport } = useViewportShell();
    const maskRevision = viewport.zoom.toFixed(4);

    withTimestampRef.current = withTimestamp;
    onChangeRef.current = onChange;
    brushRef.current = {
      strokeColor,
      strokeWidth,
      strokeOpacity: paintOpacity,
      eraserWidth,
    };

    const replacePaths = (nextPaths: CanvasPath[]) => {
      const cloned = clonePaths(nextPaths);
      pathsRef.current = cloned;
      setPaths(cloned);
      return cloned;
    };

    const setDraftStroke = (next: CanvasPath | null) => {
      draftRef.current = next;
      setDraft(next);
    };

    const pointFromClient = (
      clientX: number,
      clientY: number,
      pressure?: number,
    ): CanvasPoint => {
      const svg = svgRef.current;
      if (!svg) {
        return pressure === undefined ? { x: 0, y: 0 } : { x: 0, y: 0, pressure };
      }
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return pressure === undefined ? { x: 0, y: 0 } : { x: 0, y: 0, pressure };
      }
      const viewBox = svg.viewBox.baseVal;
      const point: CanvasPoint = {
        x: ((clientX - rect.left) / rect.width) * viewBox.width + viewBox.x,
        y: ((clientY - rect.top) / rect.height) * viewBox.height + viewBox.y,
      };
      if (pressure !== undefined) {
        point.pressure = pressure;
      }
      return point;
    };

    const commitPaths = (nextPaths: CanvasPath[]) => {
      const cloned = replacePaths(nextPaths);
      onChangeRef.current?.(cloned);
    };

    const detachWindowGesture = useRef<(() => void) | null>(null);
    /** True when pointerdown already began a stroke on this press (skip mouse). */
    const pointerOwnedThisPressRef = useRef(false);

    /**
     * Sentinel id for the mouse-event fallback path.
     * After native window drag on WebKitGTK, Pointer Events often swallow the
     * next `pointerdown` (stuck "button still down" state) while legacy
     * `mousedown`/`mousemove`/`mouseup` still fire — which is why chrome
     * buttons work and the brush doesn't. Mouse fallback covers that gap.
     */
    const MOUSE_FALLBACK_POINTER_ID = -1;

    const clearStrokeLatch = () => {
      pointerIdRef.current = null;
      pointerOwnedThisPressRef.current = false;
      detachWindowGesture.current?.();
      detachWindowGesture.current = null;
      draftRef.current = null;
      setDraft(null);
      setContentBusy('none');
    };

    const endStroke = (pointerId: number) => {
      if (pointerIdRef.current !== pointerId) return;
      const current = draftRef.current;
      pointerIdRef.current = null;
      pointerOwnedThisPressRef.current = false;
      detachWindowGesture.current?.();
      detachWindowGesture.current = null;
      draftRef.current = null;
      setDraft(null);
      setContentBusy('none');
      if (current && current.paths.length > 1) {
        commitPaths([
          ...pathsRef.current,
          {
            ...current,
            ...(withTimestampRef.current
              ? { endTimestamp: performance.now() }
              : {}),
          },
        ]);
      }
    };

    /** End whatever stroke is latched (blur / visibility / cancel). */
    const endActiveStroke = () => {
      const id = pointerIdRef.current;
      if (id === null) return;
      endStroke(id);
    };

    const appendStrokePoint = (
      clientX: number,
      clientY: number,
      pressure?: number,
    ) => {
      const current = draftRef.current;
      if (!current) return;
      const point = pointFromClient(clientX, clientY, pressure);
      const previous = current.paths[current.paths.length - 1];
      if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 1) {
        return;
      }
      setDraftStroke({ ...current, paths: [...current.paths, point] });
    };

    const attachWindowPointerGesture = (pointerId: number) => {
      detachWindowGesture.current?.();

      const onMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        appendStrokePoint(
          event.clientX,
          event.clientY,
          resolveStrokePressure(event),
        );
      };
      const onUp = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        endStroke(pointerId);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      detachWindowGesture.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
    };

    const attachWindowMouseGesture = () => {
      detachWindowGesture.current?.();
      const pointerId = MOUSE_FALLBACK_POINTER_ID;

      const onMove = (event: MouseEvent) => {
        // If the button was released without a mouseup (rare), end cleanly.
        if ((event.buttons & 1) === 0) {
          endStroke(pointerId);
          return;
        }
        // WebKitGTK mouse fallback: PE has no pressure; native bridge may.
        appendStrokePoint(event.clientX, event.clientY, resolveStrokePressure());
      };
      const onUp = (event: MouseEvent) => {
        if (event.button !== 0) return;
        endStroke(pointerId);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      detachWindowGesture.current = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
    };

    const beginStrokeAtClient = (
      pointerId: number,
      clientX: number,
      clientY: number,
      options?: {
        captureTarget?: Element | null;
        input?: 'pointer' | 'mouse';
        pressure?: number;
      },
    ) => {
      if (!canStrokeStart()) return;
      const brush = brushRef.current;
      const now = performance.now();
      const point = pointFromClient(clientX, clientY, options?.pressure);
      pointerIdRef.current = pointerId;
      setContentBusy('stroke');
      const isErase = eraseRef.current;
      setDraftStroke({
        paths: [point],
        strokeColor: brush.strokeColor,
        strokeWidth: isErase ? brush.eraserWidth : brush.strokeWidth,
        drawMode: !isErase,
        ...(!isErase ? { opacity: brush.strokeOpacity } : {}),
        ...(withTimestampRef.current ? { startTimestamp: now } : {}),
      });

      const input = options?.input ?? 'pointer';
      const captureTarget = options?.captureTarget;
      if (input === 'pointer' && captureTarget && 'setPointerCapture' in captureTarget) {
        try {
          (captureTarget as Element & { setPointerCapture: (id: number) => void }).setPointerCapture(
            pointerId,
          );
        } catch {
          // Window listeners keep the gesture alive if capture fails.
        }
      }

      if (input === 'mouse') {
        attachWindowMouseGesture();
      } else {
        attachWindowPointerGesture(pointerId);
      }
    };

    useEffect(() => {
      const onBlur = () => endActiveStroke();
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') endActiveStroke();
      };
      const onPointerCancel = () => endActiveStroke();

      window.addEventListener('blur', onBlur);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pointercancel', onPointerCancel);
      return () => {
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pointercancel', onPointerCancel);
        detachWindowGesture.current?.();
        detachWindowGesture.current = null;
        if (pointerIdRef.current !== null) {
          pointerIdRef.current = null;
          draftRef.current = null;
          setContentBusy('none');
        }
      };
    }, []);

    // Clear stuck stroke latch when OS move/resize ends (recovering).
    useEffect(() => {
      let prevPhase = getWindowGestureSnapshot().phase;
      return subscribeWindowGesture(() => {
        const next = getWindowGestureSnapshot().phase;
        if (prevPhase !== 'recovering' && next === 'recovering') {
          clearStrokeLatch();
        }
        prevPhase = next;
      });
    }, []);

    useImperativeHandle(ref, () => ({
      eraseMode: (erase) => {
        eraseRef.current = erase;
      },
      clearCanvas: () => {
        flushSync(() => {
          commitPaths([]);
        });
      },
      resetCanvas: () => commitPaths([]),
      undo: () => undefined,
      redo: () => undefined,
      exportImage: async () => `data:image/svg+xml;base64,${btoa(await makeSvg())}`,
      exportSvg: async () => makeSvg(),
      exportPaths: async () => clonePaths(pathsRef.current),
      loadPaths: (nextPaths) => {
        flushSync(() => {
          replacePaths(nextPaths);
        });
      },
      getSketchingTime: async () =>
        pathsRef.current.reduce(
          (total, path) =>
            total + Math.max(0, (path.endTimestamp ?? 0) - (path.startTimestamp ?? 0)),
          0,
        ),
    }));

    const makeSvg = async () => {
      const svg = svgRef.current;
      const viewBox = svg?.viewBox.baseVal;
      const exportWidth = viewBox?.width || (typeof width === 'number' ? width : 0);
      const exportHeight = viewBox?.height || (typeof height === 'number' ? height : 0);
      const bg =
        canvasColor && canvasColor !== 'transparent'
          ? `<rect width="100%" height="100%" fill="${escapeXml(canvasColor)}" />`
          : '';
      const image = backgroundImage
        ? `<image href="${escapeXml(backgroundImage)}" width="100%" height="100%" />`
        : '';
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}">${bg}${image}${pathsToSvgMarkup(pathsRef.current, eraserMode)}</svg>`;
    };

    const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
      if (pointerIdRef.current !== null) return;
      if (
        event.button !== 0 ||
        (allowOnlyPointerType !== 'all' && event.pointerType !== allowOnlyPointerType)
      ) {
        return;
      }

      pointerOwnedThisPressRef.current = true;
      beginStrokeAtClient(event.pointerId, event.clientX, event.clientY, {
        captureTarget: event.currentTarget,
        input: 'pointer',
        pressure: resolveStrokePressure(event.nativeEvent),
      });
    };

    /**
     * Legacy mouse fallback for WebKitGTK after native window drag / resize /
     * focus regain: Pointer Events may omit `pointerdown`, but `mousedown`
     * still arrives. Skip when pointerdown already owns this press. If a prior
     * latch is stuck (no pointerdown this press), clear it so fallback can start.
     */
    const handleMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      if (allowOnlyPointerType !== 'all' && allowOnlyPointerType !== 'mouse') {
        return;
      }

      if (pointerOwnedThisPressRef.current) {
        pointerOwnedThisPressRef.current = false;
        return;
      }

      if (pointerIdRef.current !== null) {
        clearStrokeLatch();
      }

      beginStrokeAtClient(MOUSE_FALLBACK_POINTER_ID, event.clientX, event.clientY, {
        input: 'mouse',
        pressure: resolveStrokePressure(),
      });
    };

    const viewBoxWidth = typeof width === 'number' ? width : 0;
    const viewBoxHeight = typeof height === 'number' ? height : 0;

    return (
      <svg
        ref={svgRef}
        id={id}
        className={className}
        width={width}
        height={height}
        viewBox={`${viewBoxMinX} ${viewBoxMinY} ${viewBoxWidth} ${viewBoxHeight}`}
        style={{
          touchAction: 'none',
          background: canvasColor,
          overflow: 'visible',
          ...style,
        }}
        onPointerDown={handlePointerDown}
        onMouseDown={handleMouseDown}
      >
        {backgroundImage && <image href={backgroundImage} width="100%" height="100%" />}
        <SvgPaths
          key={maskRevision}
          paths={draft ? [...paths, draft] : paths}
          eraserMode={eraserMode}
          maskRevision={maskRevision}
        />
      </svg>
    );
  },
);

ReactSketchCanvas.displayName = 'ReactSketchCanvas';
