import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  activateSketch,
  selectionAfterResizeHandleDown,
  selectionForNodeContextMenu,
  setSelection,
  toggleSelection,
  transformSketchContents,
  transformContainerContents,
  translateSelectedNodes,
} from '../../authoring';
import { chromeForNodeType } from '../../authoring/nodes';
import type { AuthoringWorkspace } from '../../authoring/workspace';
import type { NodeRef, Rect, ContainerNode, SketchNode } from '../../authoring/types';
import {
  INFINITE_CANVAS_ORIGIN,
  INFINITE_CANVAS_SIZE,
  useViewportShell,
} from '../viewport';
import { openNodeContextMenuFromEvent } from '../openAuthoringContextMenuFromEvent';
import {
  draftRectsForGroupResize,
  moveSelectionRefs,
  soleSurfaceDraft,
  startRectsForGroupResize,
  startRectsForMoveRefs,
  surfaceDraftFromMaps,
  translatedDraftById,
  type SurfaceTransformDraft,
} from './moveDraft';
import {
  applyMoveDelta,
  applyUniformEdgeResizeDelta,
  EDGE_HANDLES,
  edgeHandleRect,
  edgeStripRect,
  expandRect,
  handleCursor,
  type ResizeEdge,
} from './resizeMath';

/** Extra screen pixels beyond the box so the outline stays clickable. */
const HIT_PAD_PX = 5;
const CORNER_RADIUS = 6;

const sketchChrome = chromeForNodeType('sketch')!;
const SELECT_OUTLINE_STROKE = sketchChrome.outline;
const DRAWING_OUTLINE_STROKE =
  sketchChrome.drawingOutline ?? 'rgba(0, 0, 0, 0.14)';
const SELECTED_WASH = sketchChrome.selectedWash ?? 'transparent';
const HANDLE_FILL = sketchChrome.handle;

const infiniteViewBox = `${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_SIZE} ${INFINITE_CANVAS_SIZE}`;

export type TransformChromeBox = SketchNode | ContainerNode;

function boxRef(box: TransformChromeBox): NodeRef {
  return box.type === 'container'
    ? { type: 'container', id: box.id }
    : { type: 'sketch', id: box.id };
}

type DragState = {
  mode: 'move' | 'resize';
  handle: ResizeEdge | null;
  startRect: Rect;
  startWorld: { x: number; y: number };
  pointerId: number;
  boxId: TransformChromeBox['id'];
  boxType: 'sketch' | 'container';
  moveRefs: NodeRef[];
  startRects: Map<string, Rect>;
};

/** @deprecated Prefer SurfaceTransformDraft — alias for host compatibility. */
export type TransformDraft = SurfaceTransformDraft;

export type BoundingBoxTransformChromeProps = {
  workspace: AuthoringWorkspace;
  boxes: TransformChromeBox[];
  selection: NodeRef[];
  /** Select tool: hit targets, handles, backdrop clear. Paint/erase persist: outline only. */
  interactive: boolean;
  /** Host surface draft so peer chrome instances track a drag started elsewhere. */
  peerDraftById?: ReadonlyMap<string, Rect> | null;
  onDraftChange: (draft: SurfaceTransformDraft | null) => void;
};

export function BoundingBoxTransformChrome({
  workspace,
  boxes,
  selection,
  interactive,
  peerDraftById = null,
  onDraftChange,
}: BoundingBoxTransformChromeProps) {
  const { viewport, screenToWorld } = useViewportShell();
  const zoom = Math.max(viewport.zoom, 0.001);
  const strokeWidth = Math.max(1.5 / zoom, 1);
  const handleThickness = Math.max(6 / zoom, 6);
  const handleLength = Math.max(16 / zoom, 16);
  const edgeStripSize = Math.max(10 / zoom, 10);
  const hitPad = HIT_PAD_PX / zoom;

  const [draftById, setDraftById] = useState<Map<string, Rect> | null>(null);
  const draftByIdRef = useRef<Map<string, Rect> | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const selectedBoxIds = useMemo(() => {
    const ids = new Set<TransformChromeBox['id']>();
    for (const ref of selection) {
      if (ref.type === 'sketch' || ref.type === 'container') {
        ids.add(ref.id);
      }
    }
    return ids;
  }, [selection]);

  const displayRectFor = (box: TransformChromeBox): Rect => {
    const id = String(box.id);
    const draft = draftById?.get(id) ?? peerDraftById?.get(id);
    if (draft) {
      return draft;
    }
    return box.canvas;
  };

  const emitDraft = (draft: SurfaceTransformDraft | null) => {
    if (draft) {
      draftByIdRef.current = draft.draftById;
      setDraftById(draft.draftById);
    } else {
      draftByIdRef.current = null;
      setDraftById(null);
    }
    onDraftChange(draft);
  };

  const endDrag = useCallback(
    (commit: boolean) => {
      const drag = dragRef.current;
      const draftMap = draftByIdRef.current;
      dragRef.current = null;
      draftByIdRef.current = null;
      setDraftById(null);
      onDraftChange(null);
      if (!commit || !drag) {
        return;
      }
      if (drag.mode === 'move') {
        const start = drag.startRects.get(String(drag.boxId));
        const next = draftMap?.get(String(drag.boxId));
        if (!start || !next) {
          return;
        }
        const dx = next.x - start.x;
        const dy = next.y - start.y;
        if (dx !== 0 || dy !== 0) {
          workspace.runner.dispatch(
            translateSelectedNodes(drag.moveRefs, { x: dx, y: dy }),
          );
        }
        return;
      }
      const next = draftMap?.get(String(drag.boxId));
      if (!next) {
        return;
      }
      if (drag.boxType === 'container') {
        workspace.runner.dispatch(transformContainerContents(drag.boxId, next));
      } else {
        workspace.runner.dispatch(transformSketchContents(drag.boxId, next));
      }
    },
    [onDraftChange, workspace.runner],
  );

  const beginResize = (
    event: ReactPointerEvent,
    box: TransformChromeBox,
    handle: ResizeEdge,
  ) => {
    if (!interactive || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = boxRef(box);
    setSelection(
      workspace.sessionStore,
      selectionAfterResizeHandleDown(selection, target),
    );
    if (box.type === 'sketch') {
      activateSketch(workspace, box.id);
    }
    const world = screenToWorld(event.clientX, event.clientY);
    const startRect = { ...box.canvas };
    const startRects =
      box.type === 'container'
        ? startRectsForGroupResize(
            workspace.documentStore.getState().nodes,
            box,
          )
        : new Map<string, Rect>();
    dragRef.current = {
      mode: 'resize',
      handle,
      startRect,
      startWorld: world,
      pointerId: event.pointerId,
      boxId: box.id,
      boxType: box.type === 'container' ? 'container' : 'sketch',
      moveRefs: [],
      startRects,
    };
    if (box.type === 'container') {
      emitDraft(surfaceDraftFromMaps(startRects, new Map(startRects)));
    } else {
      emitDraft(soleSurfaceDraft(String(box.id), startRect, startRect));
    }
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  const beginMove = (event: ReactPointerEvent, box: TransformChromeBox) => {
    if (!interactive || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = boxRef(box);
    if (event.shiftKey) {
      toggleSelection(workspace.sessionStore, target);
      if (box.type === 'sketch') {
        activateSketch(workspace, box.id, { select: false });
      }
      return;
    }
    const world = screenToWorld(event.clientX, event.clientY);
    const moveRefs = moveSelectionRefs(selection, target);
    const keepMulti = moveRefs.length > 1;

    if (box.type === 'sketch') {
      if (keepMulti) {
        activateSketch(workspace, box.id, { select: false });
      } else {
        activateSketch(workspace, box.id);
      }
    } else if (!keepMulti) {
      setSelection(workspace.sessionStore, new Set([target]));
    }

    const nodes = workspace.documentStore.getState().nodes;
    const startRects = startRectsForMoveRefs(nodes, moveRefs);
    const startRect = startRects.get(String(box.id)) ?? { ...box.canvas };
    dragRef.current = {
      mode: 'move',
      handle: null,
      startRect,
      startWorld: world,
      pointerId: event.pointerId,
      boxId: box.id,
      boxType: box.type === 'container' ? 'container' : 'sketch',
      moveRefs,
      startRects,
    };
    emitDraft(surfaceDraftFromMaps(startRects, new Map(startRects)));
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  const onDragPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const world = screenToWorld(event.clientX, event.clientY);
    const dx = world.x - drag.startWorld.x;
    const dy = world.y - drag.startWorld.y;
    if (drag.mode === 'move') {
      const nextMap = translatedDraftById(drag.startRects, dx, dy);
      emitDraft(surfaceDraftFromMaps(drag.startRects, nextMap));
      return;
    }
    const next =
      drag.handle == null
        ? applyMoveDelta(drag.startRect, dx, dy)
        : applyUniformEdgeResizeDelta(drag.startRect, drag.handle, dx, dy);
    if (drag.boxType === 'container' && drag.startRects.size > 0) {
      const draftById = draftRectsForGroupResize(
        drag.startRects,
        String(drag.boxId),
        next,
      );
      emitDraft(surfaceDraftFromMaps(drag.startRects, draftById));
      return;
    }
    emitDraft(
      soleSurfaceDraft(String(drag.boxId), drag.startRect, next),
    );
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

  const onBoxContextMenu = (
    event: ReactMouseEvent,
    box: TransformChromeBox,
  ) => {
    if (!interactive) return;
    const target = boxRef(box);
    setSelection(
      workspace.sessionStore,
      selectionForNodeContextMenu(
        workspace.sessionStore.getState().selection,
        target,
      ),
    );
    if (box.type === 'sketch') {
      activateSketch(workspace, box.id, { select: false });
    }
    openNodeContextMenuFromEvent(
      event,
      screenToWorld(event.clientX, event.clientY),
    );
  };

  if (boxes.length === 0) {
    return null;
  }

  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox={infiniteViewBox}
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      {boxes.map((box) => {
        if (!box.visible || box.locked) {
          return null;
        }
        const rect = displayRectFor(box);
        const hit = expandRect(rect, hitPad);
        const isSelected = selectedBoxIds.has(box.id);
        const canSelect = interactive;
        const selectedChrome = canSelect && isSelected;
        const showHandles = canSelect && isSelected;
        const outlineStroke = interactive
          ? SELECT_OUTLINE_STROKE
          : DRAWING_OUTLINE_STROKE;
        const washInset = strokeWidth / 2;
        const washRx = Math.max(0, CORNER_RADIUS - washInset);

        return (
          <g key={box.id}>
            {canSelect ? (
              <rect
                x={hit.x}
                y={hit.y}
                width={hit.width}
                height={hit.height}
                fill="transparent"
                stroke="none"
                style={{
                  cursor: isSelected ? 'move' : 'pointer',
                  pointerEvents: 'auto',
                }}
                onPointerDown={(event) => beginMove(event, box)}
                onPointerMove={onDragPointerMove}
                onPointerUp={onDragPointerUp}
                onPointerCancel={onDragPointerUp}
                onContextMenu={(event) => onBoxContextMenu(event, box)}
              />
            ) : null}
            {selectedChrome ? (
              <rect
                x={rect.x + washInset}
                y={rect.y + washInset}
                width={Math.max(0, rect.width - washInset * 2)}
                height={Math.max(0, rect.height - washInset * 2)}
                rx={washRx}
                ry={washRx}
                fill={SELECTED_WASH}
                stroke="none"
                style={{ pointerEvents: 'none' }}
              />
            ) : null}
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              rx={CORNER_RADIUS}
              ry={CORNER_RADIUS}
              fill="none"
              stroke={outlineStroke}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              style={{ pointerEvents: 'none' }}
            />
            {showHandles
              ? EDGE_HANDLES.map((handle) => {
                  const strip = edgeStripRect(rect, handle, edgeStripSize);
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
                        beginResize(event, box, handle)
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
                    rect,
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
                        beginResize(event, box, handle)
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
