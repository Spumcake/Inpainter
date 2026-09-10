import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  frameCardRect,
  selectionAfterResizeHandleDown,
  selectionForNodeContextMenu,
  setFrameCrop,
  setSelection,
  toggleSelection,
  transformFrameGraph,
  translateSelectedNodes,
} from '../../authoring';
import {
  computeAspectLockedResizeSnap,
  computeGroupMoveSnap,
  emptySnapGuides,
  type SnapGuideState,
} from './graphSnapping';
import { FRAME_CHROME } from '../../authoring/nodes/nodeChrome';
import { chromeForNode, chromeForNodeType } from '../../authoring/nodes';
import type { AuthoringWorkspace } from '../../authoring/workspace';
import type { FrameNode, NodeRef, Rect } from '../../authoring/types';
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
import {
  resolveBodyMove,
  resolveChromeInteriorFill,
  shouldMountBodyMovePad,
  type TransformChromeInteraction,
} from './transformChromeOptions';

/** Extra screen pixels beyond the box so the outline stays clickable. */
const HIT_PAD_PX = 5;
const CORNER_RADIUS = 6;

const defaultFrameChrome = chromeForNodeType('frame')!;

const infiniteViewBox = `${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_SIZE} ${INFINITE_CANVAS_SIZE}`;

type DragState = {
  mode: 'move' | 'resize';
  handle: ResizeEdge | null;
  startRect: Rect;
  startWorld: { x: number; y: number };
  pointerId: number;
  frameId: FrameNode['id'];
  moveRefs: NodeRef[];
  startRects: Map<string, Rect>;
};

/** Alias — hosts consume draftById from SurfaceTransformDraft. */
export type FrameTransformDraft = SurfaceTransformDraft;

export type FrameTransformChromeProps = {
  workspace: AuthoringWorkspace;
  frames: FrameNode[];
  selection: NodeRef[];
  /** Select tool: hit targets, handles (crop), backdrop clear. */
  interactive: boolean;
  /**
   * `graph` — Frame on Graph board (position + size; size is crop w/h).
   * `crop` — Frame crop on Canvas (full crop rect).
   */
  geometry: 'graph' | 'crop';
  /** Optional; GraphHost syncs Frame card thumbnails to this draft. */
  onDraftChange?: (draft: SurfaceTransformDraft | null) => void;
  /** Host surface draft so peer chrome instances track a drag started elsewhere. */
  peerDraftById?: ReadonlyMap<string, Rect> | null;
  /** Shared transform chrome policy (body move, underlay fill). */
  interaction?: TransformChromeInteraction;
  /** Graph edge snap: peer rects excluding the moving selection. */
  getSnapCandidates?: (excludeRefs: readonly NodeRef[]) => Rect[];
  /** Graph edge snap: ephemeral alignment guides for the host overlay. */
  onSnapGuidesChange?: (guides: SnapGuideState, color: string) => void;
};

function rectForFrame(frame: FrameNode, geometry: 'graph' | 'crop'): Rect {
  return geometry === 'graph' ? frameCardRect(frame) : { ...frame.crop };
}

export function FrameTransformChrome({
  workspace,
  frames,
  selection,
  interactive,
  geometry,
  onDraftChange,
  peerDraftById = null,
  interaction,
  getSnapCandidates,
  onSnapGuidesChange,
}: FrameTransformChromeProps) {
  const bodyMove = resolveBodyMove(interaction);
  const { viewport, screenToWorld } = useViewportShell();
  const zoom = Math.max(viewport.zoom, 0.001);
  const strokeWidth = Math.max(1.5 / zoom, 1);
  const handleThickness = Math.max(6 / zoom, 6);
  const handleLength = Math.max(16 / zoom, 16);
  const edgeStripSize = Math.max(10 / zoom, 10);
  const hitPad = HIT_PAD_PX / zoom;
  const allowResize = true;
  const nodes = workspace.documentStore.getState().nodes;

  const [draftById, setDraftById] = useState<Map<string, Rect> | null>(null);
  const draftByIdRef = useRef<Map<string, Rect> | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  const getSnapCandidatesRef = useRef(getSnapCandidates);
  getSnapCandidatesRef.current = getSnapCandidates;
  const onSnapGuidesChangeRef = useRef(onSnapGuidesChange);
  onSnapGuidesChangeRef.current = onSnapGuidesChange;

  const emitDraft = (draft: SurfaceTransformDraft | null) => {
    if (draft) {
      draftByIdRef.current = draft.draftById;
      setDraftById(draft.draftById);
    } else {
      draftByIdRef.current = null;
      setDraftById(null);
    }
    onDraftChangeRef.current?.(draft);
  };

  const selectedFrameIds = useMemo(() => {
    const ids = new Set<FrameNode['id']>();
    for (const ref of selection) {
      if (ref.type === 'frame') {
        ids.add(ref.id);
      }
    }
    return ids;
  }, [selection]);

  const displayRectFor = (frame: FrameNode): Rect => {
    const id = String(frame.id);
    const draft = draftById?.get(id) ?? peerDraftById?.get(id);
    if (draft) {
      return draft;
    }
    return rectForFrame(frame, geometry);
  };

  const activateFrame = useCallback(
    (frameId: FrameNode['id']) => {
      setSelection(
        workspace.sessionStore,
        new Set<NodeRef>([{ type: 'frame', id: frameId }]),
      );
    },
    [workspace.sessionStore],
  );

  const snapGuideColorForFrame = useCallback(
    (frameId: FrameNode['id']) => {
      const docNodes = workspace.documentStore.getState().nodes;
      const frame = docNodes[frameId];
      if (frame?.type === 'frame') {
        return (chromeForNode(frame, docNodes) ?? defaultFrameChrome).outline;
      }
      return FRAME_CHROME.outline;
    },
    [workspace.documentStore],
  );

  const reportSnapGuides = useCallback(
    (frameId: FrameNode['id'], guides: SnapGuideState) => {
      onSnapGuidesChangeRef.current?.(guides, snapGuideColorForFrame(frameId));
    },
    [snapGuideColorForFrame],
  );

  const endDrag = useCallback(
    (commit: boolean) => {
      const drag = dragRef.current;
      const draftMap = draftByIdRef.current;
      dragRef.current = null;
      draftByIdRef.current = null;
      setDraftById(null);
      emitDraft(null);
      if (!commit || !drag) {
        return;
      }
      const next = draftMap?.get(String(drag.frameId));
      if (!next) {
        return;
      }
      if (drag.mode === 'move' && geometry === 'graph') {
        const start = drag.startRects.get(String(drag.frameId));
        if (!start) {
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
      if (geometry === 'graph') {
        workspace.runner.dispatch(
          transformFrameGraph(
            drag.frameId,
            { x: next.x, y: next.y },
            { width: next.width, height: next.height },
          ),
        );
        return;
      }
      workspace.runner.dispatch(setFrameCrop(drag.frameId, next));
    },
    [geometry, workspace.runner],
  );

  const beginResize = (
    event: ReactPointerEvent,
    frame: FrameNode,
    handle: ResizeEdge,
  ) => {
    if (!interactive || event.button !== 0) return;
    if (!allowResize) return;
    event.preventDefault();
    event.stopPropagation();
    setSelection(
      workspace.sessionStore,
      selectionAfterResizeHandleDown(selection, {
        type: 'frame',
        id: frame.id,
      }),
    );
    const world = screenToWorld(event.clientX, event.clientY);
    const startRect = rectForFrame(frame, geometry);
    dragRef.current = {
      mode: 'resize',
      handle,
      startRect,
      startWorld: world,
      pointerId: event.pointerId,
      frameId: frame.id,
      moveRefs: [],
      startRects: new Map(),
    };
    emitDraft(soleSurfaceDraft(String(frame.id), startRect, startRect));
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  const beginMove = (event: ReactPointerEvent, frame: FrameNode) => {
    if (!interactive || event.button !== 0) return;
    if (!bodyMove) return;
    event.preventDefault();
    event.stopPropagation();
    const target: NodeRef = { type: 'frame', id: frame.id };
    if (event.shiftKey && geometry === 'graph') {
      toggleSelection(workspace.sessionStore, target);
      return;
    }
    const world = screenToWorld(event.clientX, event.clientY);
    const moveRefs =
      geometry === 'graph'
        ? moveSelectionRefs(selection, target)
        : [target];
    if (moveRefs.length === 1) {
      activateFrame(frame.id);
    }

    const docNodes = workspace.documentStore.getState().nodes;
    const startRects = startRectsForMoveRefs(docNodes, moveRefs, geometry);
    const startRect =
      startRects.get(String(frame.id)) ?? rectForFrame(frame, geometry);
    dragRef.current = {
      mode: 'move',
      handle: null,
      startRect,
      startWorld: world,
      pointerId: event.pointerId,
      frameId: frame.id,
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
      if (geometry === 'graph' && getSnapCandidatesRef.current) {
        const starts = [...drag.startRects.values()];
        const snapped = computeGroupMoveSnap(
          starts,
          dx,
          dy,
          getSnapCandidatesRef.current(drag.moveRefs),
          { zoom: viewport.zoom },
        );
        const nextMap = translatedDraftById(
          drag.startRects,
          dx + snapped.deltaX,
          dy + snapped.deltaY,
        );
        emitDraft(surfaceDraftFromMaps(drag.startRects, nextMap));
        reportSnapGuides(drag.frameId, snapped.guides);
        return;
      }
      const nextMap = translatedDraftById(drag.startRects, dx, dy);
      emitDraft(surfaceDraftFromMaps(drag.startRects, nextMap));
      if (geometry === 'graph') {
        reportSnapGuides(drag.frameId, emptySnapGuides());
      }
      return;
    }
    // Frame resize is uniform — crop aspect stays locked; resolution fields unchanged.
    const raw = applyUniformEdgeResizeDelta(
      drag.startRect,
      drag.handle!,
      dx,
      dy,
    );
    if (geometry === 'graph' && getSnapCandidatesRef.current) {
      const snapped = computeAspectLockedResizeSnap(
        raw,
        drag.handle!,
        drag.startRect,
        getSnapCandidatesRef.current([{ type: 'frame', id: drag.frameId }]),
        { zoom: viewport.zoom },
      );
      emitDraft(
        soleSurfaceDraft(String(drag.frameId), drag.startRect, snapped.bounds),
      );
      reportSnapGuides(drag.frameId, snapped.guides);
      return;
    }
    emitDraft(soleSurfaceDraft(String(drag.frameId), drag.startRect, raw));
    if (geometry === 'graph') {
      reportSnapGuides(drag.frameId, emptySnapGuides());
    }
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

  const onFrameContextMenu = (
    event: ReactMouseEvent,
    frame: FrameNode,
  ) => {
    if (!interactive) return;
    setSelection(
      workspace.sessionStore,
      selectionForNodeContextMenu(
        workspace.sessionStore.getState().selection,
        { type: 'frame', id: frame.id },
      ),
    );
    openNodeContextMenuFromEvent(
      event,
      screenToWorld(event.clientX, event.clientY),
    );
  };

  if (frames.length === 0) {
    return null;
  }

  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox={infiniteViewBox}
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      {frames.map((frame) => {
        if (!frame.visible || frame.locked) {
          return null;
        }
        const rect = displayRectFor(frame);
        const hit = expandRect(rect, hitPad);
        const isSelected = selectedFrameIds.has(frame.id);
        const canSelect = interactive;
        const showHandles = canSelect && allowResize && isSelected;
        const interiorFill = resolveChromeInteriorFill(interaction, geometry);
        const mountBodyMovePad = shouldMountBodyMovePad(canSelect, bodyMove);
        const chrome = chromeForNode(frame, nodes) ?? defaultFrameChrome;

        return (
          <g key={frame.id}>
            {mountBodyMovePad ? (
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
                onPointerDown={(event) => beginMove(event, frame)}
                onPointerMove={onDragPointerMove}
                onPointerUp={onDragPointerUp}
                onPointerCancel={onDragPointerUp}
                onContextMenu={(event) => onFrameContextMenu(event, frame)}
              />
            ) : null}
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              rx={CORNER_RADIUS}
              ry={CORNER_RADIUS}
              fill={interiorFill}
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
                        beginResize(event, frame, handle)
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
                        beginResize(event, frame, handle)
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
