import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  selectionAfterResizeHandleDown,
  selectionForNodeContextMenu,
  setSelection,
  toggleSelection,
  transformImageRect,
  translateSelectedNodes,
} from '../../authoring';
import { chromeForNode } from '../../authoring/nodes';
import { imageRect } from '../../authoring/document';
import type { AuthoringWorkspace } from '../../authoring/workspace';
import type { ImageNode, NodeRef, Rect } from '../../authoring/types';
import {
  INFINITE_CANVAS_ORIGIN,
  INFINITE_CANVAS_SIZE,
  useViewportShell,
} from '../viewport';
import { openNodeContextMenuFromEvent } from '../openAuthoringContextMenuFromEvent';
import {
  moveSelectionRefs,
  soleSurfaceDraft,
  startRectsForMoveRefs,
  surfaceDraftFromMaps,
  translatedDraftById,
  type SurfaceTransformDraft,
} from './moveDraft';
import {
  applyUniformEdgeResizeDelta,
  EDGE_HANDLES,
  edgeHandleRect,
  edgeStripRect,
  expandRect,
  handleCursor,
  type ResizeEdge,
} from './resizeMath';

const HIT_PAD_PX = 5;
const CORNER_RADIUS = 6;

const infiniteViewBox = `${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_SIZE} ${INFINITE_CANVAS_SIZE}`;

type DragState = {
  mode: 'move' | 'resize';
  handle: ResizeEdge | null;
  startRect: Rect;
  startWorld: { x: number; y: number };
  pointerId: number;
  imageId: ImageNode['id'];
  moveRefs: NodeRef[];
  startRects: Map<string, Rect>;
};

/** Alias — hosts consume draftById from SurfaceTransformDraft. */
export type ImageTransformDraft = SurfaceTransformDraft;

export type ImageTransformChromeProps = {
  workspace: AuthoringWorkspace;
  images: ImageNode[];
  selection: NodeRef[];
  interactive: boolean;
  /** Host surface draft so peer chrome instances track a drag started elsewhere. */
  peerDraftById?: ReadonlyMap<string, Rect> | null;
  onDraftChange?: (draft: SurfaceTransformDraft | null) => void;
};

export function ImageTransformChrome({
  workspace,
  images,
  selection,
  interactive,
  peerDraftById = null,
  onDraftChange,
}: ImageTransformChromeProps) {
  const { viewport, screenToWorld } = useViewportShell();
  const zoom = Math.max(viewport.zoom, 0.001);
  const strokeWidth = Math.max(1.5 / zoom, 1);
  const handleThickness = Math.max(6 / zoom, 6);
  const handleLength = Math.max(16 / zoom, 16);
  const edgeStripSize = Math.max(10 / zoom, 10);
  const hitPad = HIT_PAD_PX / zoom;
  const nodes = workspace.documentStore.getState().nodes;

  const [draftById, setDraftById] = useState<Map<string, Rect> | null>(null);
  const draftByIdRef = useRef<Map<string, Rect> | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const selectedImageIds = useMemo(() => {
    const ids = new Set<ImageNode['id']>();
    for (const ref of selection) {
      if (ref.type === 'image') {
        ids.add(ref.id);
      }
    }
    return ids;
  }, [selection]);

  const displayRectFor = (node: ImageNode): Rect => {
    const id = String(node.id);
    const draft = draftById?.get(id) ?? peerDraftById?.get(id);
    if (draft) {
      return draft;
    }
    return imageRect(node);
  };

  const emitDraft = (draft: SurfaceTransformDraft | null) => {
    if (draft) {
      draftByIdRef.current = draft.draftById;
      setDraftById(draft.draftById);
    } else {
      draftByIdRef.current = null;
      setDraftById(null);
    }
    onDraftChange?.(draft);
  };

  const endDrag = useCallback(
    (commit: boolean) => {
      const drag = dragRef.current;
      const draftMap = draftByIdRef.current;
      dragRef.current = null;
      draftByIdRef.current = null;
      setDraftById(null);
      onDraftChange?.(null);
      if (!commit || !drag) {
        return;
      }
      if (drag.mode === 'move') {
        const start = drag.startRects.get(String(drag.imageId));
        const next = draftMap?.get(String(drag.imageId));
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
      const next = draftMap?.get(String(drag.imageId));
      if (!next) {
        return;
      }
      workspace.runner.dispatch(transformImageRect(drag.imageId, next));
    },
    [onDraftChange, workspace.runner],
  );

  const beginResize = (
    event: ReactPointerEvent,
    node: ImageNode,
    handle: ResizeEdge,
  ) => {
    if (!interactive || event.button !== 0 || node.locked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelection(
      workspace.sessionStore,
      selectionAfterResizeHandleDown(selection, {
        type: 'image',
        id: node.id,
      }),
    );
    const world = screenToWorld(event.clientX, event.clientY);
    const startRect = imageRect(node);
    dragRef.current = {
      mode: 'resize',
      handle,
      startRect,
      startWorld: world,
      pointerId: event.pointerId,
      imageId: node.id,
      moveRefs: [],
      startRects: new Map(),
    };
    emitDraft(soleSurfaceDraft(String(node.id), startRect, startRect));
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  const beginMove = (event: ReactPointerEvent, node: ImageNode) => {
    if (!interactive || event.button !== 0 || node.locked) return;
    event.preventDefault();
    event.stopPropagation();
    const target: NodeRef = { type: 'image', id: node.id };
    if (event.shiftKey) {
      toggleSelection(workspace.sessionStore, target);
      return;
    }
    const world = screenToWorld(event.clientX, event.clientY);
    const moveRefs = moveSelectionRefs(selection, target);
    if (moveRefs.length === 1) {
      setSelection(workspace.sessionStore, new Set<NodeRef>(moveRefs));
    }

    const docNodes = workspace.documentStore.getState().nodes;
    const startRects = startRectsForMoveRefs(docNodes, moveRefs);
    const startRect = startRects.get(String(node.id)) ?? imageRect(node);
    dragRef.current = {
      mode: 'move',
      handle: null,
      startRect,
      startWorld: world,
      pointerId: event.pointerId,
      imageId: node.id,
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
    const next = applyUniformEdgeResizeDelta(
      drag.startRect,
      drag.handle!,
      dx,
      dy,
    );
    emitDraft(soleSurfaceDraft(String(drag.imageId), drag.startRect, next));
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

  const onNodeContextMenu = (
    event: ReactMouseEvent,
    node: ImageNode,
  ) => {
    if (!interactive || node.locked) return;
    setSelection(
      workspace.sessionStore,
      selectionForNodeContextMenu(
        workspace.sessionStore.getState().selection,
        { type: 'image', id: node.id },
      ),
    );
    openNodeContextMenuFromEvent(
      event,
      screenToWorld(event.clientX, event.clientY),
    );
  };

  if (images.length === 0) {
    return null;
  }

  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox={infiniteViewBox}
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      {images.map((node) => {
        if (!node.visible || node.locked) {
          return null;
        }
        const rect = displayRectFor(node);
        const hit = expandRect(rect, hitPad);
        const isSelected = selectedImageIds.has(node.id);
        const canSelect = interactive;
        const showHandles = canSelect && isSelected;
        const chrome = chromeForNode(node, nodes)!;

        return (
          <g key={node.id}>
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
                onPointerDown={(event) => beginMove(event, node)}
                onPointerMove={onDragPointerMove}
                onPointerUp={onDragPointerUp}
                onPointerCancel={onDragPointerUp}
                onContextMenu={(event) => onNodeContextMenu(event, node)}
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
              stroke={chrome.outline}
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
                        beginResize(event, node, handle)
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
                      fill={chrome.handle}
                      stroke="none"
                      style={{
                        cursor: handleCursor(handle),
                        pointerEvents: 'auto',
                      }}
                      onPointerDown={(event) =>
                        beginResize(event, node, handle)
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
