import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { setOutputRelativeScale } from '../../authoring';
import { chromeForNodeType } from '../../authoring/nodes';
import {
  findOutputForOwner,
  hostRectForOwner,
  outputDisplayRect,
  parseAspectRatio,
  relativeScaleFromDisplayRect,
} from '../../authoring/nodes/outputGeometry';
import { isNodeFocusType } from '../../authoring/nodes/nodeFocus';
import { nodeOnSurface } from '../../authoring/document/nodeOnSurface';
import type { CanvasId } from '../../authoring/ids';
import type { AuthoringWorkspace } from '../../authoring/workspace';
import type { NodeRef, OutputNode, Rect } from '../../authoring/types';
import {
  INFINITE_CANVAS_ORIGIN,
  INFINITE_CANVAS_SIZE,
  useViewportShell,
} from '../viewport';
import {
  applyCenterUniformEdgeResizeDelta,
  EDGE_HANDLES,
  edgeHandleRect,
  edgeStripRect,
  handleCursor,
  type ResizeEdge,
} from './resizeMath';

const CORNER_RADIUS = 6;

const outputChrome = chromeForNodeType('output')!;
const SELECT_OUTLINE_STROKE = outputChrome.outline;
const HANDLE_FILL = outputChrome.handle;

const infiniteViewBox = `${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_SIZE} ${INFINITE_CANVAS_SIZE}`;

type DragState = {
  handle: ResizeEdge;
  startRect: Rect;
  startWorld: { x: number; y: number };
  pointerId: number;
  outputId: OutputNode['id'];
  host: Rect;
  aspect: { w: number; h: number };
};

export type OutputTransformDraft = {
  outputId: OutputNode['id'];
  rect: Rect;
};

export type OutputTransformChromeProps = {
  workspace: AuthoringWorkspace;
  selection: NodeRef[];
  /** Agent mode: show Output chrome for focused owners on this canvas. */
  active: boolean;
  canvasId: CanvasId;
  /** Live resize draft for Canvas TransformBoxUnderlay (below content). */
  onDraftChange?: (draft: OutputTransformDraft | null) => void;
};

export function OutputTransformChrome({
  workspace,
  selection,
  active,
  canvasId,
  onDraftChange,
}: OutputTransformChromeProps) {
  const documentState = useSyncExternalStore(
    (onStoreChange) => workspace.documentStore.subscribe(onStoreChange),
    () => workspace.documentStore.getState(),
    () => workspace.documentStore.getState(),
  );
  const { viewport, screenToWorld } = useViewportShell();
  const zoom = Math.max(viewport.zoom, 0.001);
  const strokeWidth = Math.max(1.5 / zoom, 1);
  const handleThickness = Math.max(6 / zoom, 6);
  const handleLength = Math.max(16 / zoom, 16);
  const edgeStripSize = Math.max(10 / zoom, 10);

  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const draftRef = useRef<Rect | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const focusedOutputs = useMemo(() => {
    if (!active) return [] as OutputNode[];
    const out: OutputNode[] = [];
    const focus = {
      documentId: null,
      graphId: null,
      canvasId,
    };
    for (const ref of selection) {
      if (!isNodeFocusType(ref.type)) continue;
      const owner = documentState.nodes[ref.id];
      if (!owner) continue;
      if (!nodeOnSurface(owner, focus, documentState)) continue;
      const output = findOutputForOwner(documentState, ref.id);
      if (output) out.push(output);
    }
    return out;
  }, [active, canvasId, documentState, selection]);

  const endDrag = useCallback(
    (commit: boolean) => {
      const drag = dragRef.current;
      const draft = draftRef.current;
      dragRef.current = null;
      draftRef.current = null;
      setDraftRect(null);
      onDraftChange?.(null);
      if (!commit || !drag || !draft) {
        return;
      }
      const nextScale = relativeScaleFromDisplayRect(
        drag.host,
        drag.aspect,
        draft,
      );
      workspace.runner.dispatch(
        setOutputRelativeScale(drag.outputId, nextScale),
      );
    },
    [onDraftChange, workspace.runner],
  );

  const beginDrag = (
    event: ReactPointerEvent,
    output: OutputNode,
    handle: ResizeEdge,
    startRect: Rect,
    host: Rect,
  ) => {
    if (!active || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const world = screenToWorld(event.clientX, event.clientY);
    dragRef.current = {
      handle,
      startRect,
      startWorld: world,
      pointerId: event.pointerId,
      outputId: output.id,
      host,
      aspect: parseAspectRatio(output.ratio),
    };
    draftRef.current = startRect;
    setDraftRect(startRect);
    onDraftChange?.({ outputId: output.id, rect: startRect });
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  const onDragPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const world = screenToWorld(event.clientX, event.clientY);
    const dx = world.x - drag.startWorld.x;
    const dy = world.y - drag.startWorld.y;
    const next = applyCenterUniformEdgeResizeDelta(
      drag.startRect,
      drag.handle,
      dx,
      dy,
    );
    draftRef.current = next;
    setDraftRect(next);
    onDraftChange?.({ outputId: drag.outputId, rect: next });
  };

  const onDragPointerUp = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    try {
      (event.currentTarget as Element).releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    endDrag(true);
  };

  if (!active || focusedOutputs.length === 0) {
    return null;
  }

  const soleOutput =
    focusedOutputs.length === 1 ? focusedOutputs[0]! : null;

  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox={infiniteViewBox}
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      {focusedOutputs.map((output) => {
        const host = hostRectForOwner(documentState, output.ownerId);
        if (!host) return null;
        const baseRect =
          soleOutput?.id === output.id && draftRect
            ? draftRect
            : outputDisplayRect(documentState, output);
        if (!baseRect) return null;
        const showHandles = soleOutput?.id === output.id;

        return (
          <g key={output.id}>
            <rect
              x={baseRect.x}
              y={baseRect.y}
              width={baseRect.width}
              height={baseRect.height}
              rx={CORNER_RADIUS}
              ry={CORNER_RADIUS}
              fill="none"
              stroke={SELECT_OUTLINE_STROKE}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              style={{ pointerEvents: 'none' }}
            />
            {showHandles
              ? EDGE_HANDLES.map((handle) => {
                  const strip = edgeStripRect(baseRect, handle, edgeStripSize);
                  return (
                    <rect
                      key={`strip-${handle}`}
                      x={strip.x}
                      y={strip.y}
                      width={strip.width}
                      height={strip.height}
                      fill="transparent"
                      stroke="none"
                      style={{
                        cursor: handleCursor(handle),
                        pointerEvents: 'auto',
                      }}
                      onPointerDown={(event) =>
                        beginDrag(event, output, handle, baseRect, host)
                      }
                      onPointerMove={onDragPointerMove}
                      onPointerUp={onDragPointerUp}
                      onPointerCancel={onDragPointerUp}
                    />
                  );
                })
              : null}
            {showHandles
              ? EDGE_HANDLES.map((handle) => {
                  const knob = edgeHandleRect(
                    baseRect,
                    handle,
                    handleThickness,
                    handleLength,
                  );
                  return (
                    <rect
                      key={`knob-${handle}`}
                      x={knob.x}
                      y={knob.y}
                      width={knob.width}
                      height={knob.height}
                      fill={HANDLE_FILL}
                      stroke="none"
                      style={{
                        cursor: handleCursor(handle),
                        pointerEvents: 'auto',
                      }}
                      onPointerDown={(event) =>
                        beginDrag(event, output, handle, baseRect, host)
                      }
                      onPointerMove={onDragPointerMove}
                      onPointerUp={onDragPointerUp}
                      onPointerCancel={onDragPointerUp}
                    />
                  );
                })
              : null}
          </g>
        );
      })}
    </svg>
  );
}
