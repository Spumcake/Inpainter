import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  iconForNodeType,
  listCanvasSurfaceStack,
  listGraphSurfaceStack,
  moveNodeInSurfaceStack,
  selectTargetLabel,
  selectTargetsForFocusedSurface,
  setNodeLocked,
  setNodeVisible,
  setSelection,
  type NodeRef,
  type SelectTargetRow,
} from '../authoring';
import type { NodeId } from '../authoring/ids';
import type { AuthoringWorkspace } from '../authoring/workspace';
import {
  CHROME_LIST_ITEM_ACTIVE,
  CHROME_LIST_ITEM_DEFAULT,
} from '../chrome';
import { GlobalPanel } from './GlobalPanel';

/** Match canvas / preset-strip threshold before a press becomes a drag. */
const OUTLINER_ROW_DRAG_THRESHOLD = 4;

type OutlinerPanelProps = {
  workspace: AuthoringWorkspace;
  onClose: () => void;
};

type OutlinerSnapshot = {
  documentRevision: unknown;
  selectionKey: string;
  viewFocusKey: string;
};

type DragState = {
  sourceId: NodeId;
  startY: number;
  active: boolean;
  overId: NodeId;
  mode: 'pointer' | 'mouse';
  pointerId: number;
  /** Select this row on release if the press never crossed the drag threshold. */
  selectOnRelease: boolean;
};

const outlinerSnapshotCache = new WeakMap<AuthoringWorkspace, OutlinerSnapshot>();

function subscribeOutliner(
  workspace: AuthoringWorkspace,
  onStoreChange: () => void,
): () => void {
  const unsubDocument = workspace.documentStore.subscribe(onStoreChange);
  const unsubSession = workspace.sessionStore.subscribe(onStoreChange);
  return () => {
    unsubDocument();
    unsubSession();
  };
}

function getOutlinerSnapshot(workspace: AuthoringWorkspace): OutlinerSnapshot {
  const documentState = workspace.documentStore.getState();
  const sessionState = workspace.sessionStore.getState();
  const selectionKey = [...sessionState.selection]
    .map((ref) => `${ref.type}:${ref.id}`)
    .sort()
    .join('\0');
  const next: OutlinerSnapshot = {
    documentRevision: documentState,
    selectionKey,
    viewFocusKey: `${sessionState.viewFocus.graphId ?? ''}:${sessionState.viewFocus.canvasId ?? ''}`,
  };
  const cached = outlinerSnapshotCache.get(workspace);
  if (
    cached &&
    cached.documentRevision === next.documentRevision &&
    cached.selectionKey === next.selectionKey &&
    cached.viewFocusKey === next.viewFocusKey
  ) {
    return cached;
  }
  outlinerSnapshotCache.set(workspace, next);
  return next;
}

function isRowSelected(
  selection: ReadonlySet<NodeRef>,
  nodeId: NodeId,
  type: NodeRef['type'],
): boolean {
  for (const ref of selection) {
    if (ref.id === nodeId && ref.type === type) {
      return true;
    }
  }
  return false;
}

/** Ascending surface-stack index for `targetId` (Document list move Commands use). */
function ascendingIndexForTarget(
  workspace: AuthoringWorkspace,
  targetId: NodeId,
  sourceNode: SelectTargetRow['node'],
): number | null {
  const documentState = workspace.documentStore.getState();
  const sessionState = workspace.sessionStore.getState();
  const { graphId, canvasId } = sessionState.viewFocus;

  let ordered: { id: NodeId }[] = [];
  if (canvasId) {
    ordered = listCanvasSurfaceStack(documentState, canvasId);
  } else if (graphId) {
    ordered = listGraphSurfaceStack(documentState, graphId);
  } else if (sourceNode.type === 'sketch') {
    ordered = listCanvasSurfaceStack(documentState, sourceNode.canvasId);
  } else if (
    sourceNode.type === 'image' &&
    sourceNode.placement.kind === 'canvas'
  ) {
    ordered = listCanvasSurfaceStack(
      documentState,
      sourceNode.placement.canvasId,
    );
  }

  const index = ordered.findIndex((node) => node.id === targetId);
  return index >= 0 ? index : null;
}

function dispatchMoveToTarget(
  workspace: AuthoringWorkspace,
  source: SelectTargetRow,
  targetId: NodeId,
): void {
  if (source.node.id === targetId) return;
  const toIndex = ascendingIndexForTarget(workspace, targetId, source.node);
  if (toIndex == null) {
    return;
  }
  const graphId = workspace.sessionStore.getState().viewFocus.graphId;
  workspace.runner.dispatch(
    moveNodeInSurfaceStack(source.node.id, toIndex, graphId),
  );
}

/**
 * Nudge within the Outliner display order (front at top).
 * `up` = toward front; `down` = toward back.
 */
function dispatchNudge(
  workspace: AuthoringWorkspace,
  rows: readonly SelectTargetRow[],
  source: SelectTargetRow,
  direction: 'up' | 'down',
): void {
  const from = rows.findIndex((row) => row.node.id === source.node.id);
  if (from < 0) return;
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= rows.length) return;
  const target = rows[to];
  if (!target) return;
  dispatchMoveToTarget(workspace, source, target.node.id);
}

function overIdAtClientY(
  rows: readonly SelectTargetRow[],
  rowEls: ReadonlyMap<NodeId, HTMLElement>,
  clientY: number,
  fallbackId: NodeId,
): NodeId {
  for (const row of rows) {
    const el = rowEls.get(row.node.id);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const mid = (rect.top + rect.bottom) / 2;
    if (clientY < mid) {
      return row.node.id;
    }
  }
  const last = rows[rows.length - 1];
  return last?.node.id ?? fallbackId;
}

export function OutlinerPanel({ workspace, onClose }: OutlinerPanelProps) {
  useSyncExternalStore(
    (onStoreChange) => subscribeOutliner(workspace, onStoreChange),
    () => getOutlinerSnapshot(workspace),
    () => getOutlinerSnapshot(workspace),
  );

  const documentState = workspace.documentStore.getState();
  const sessionState = workspace.sessionStore.getState();
  const rows = selectTargetsForFocusedSurface(documentState, sessionState);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const rowElsRef = useRef(new Map<NodeId, HTMLElement>());
  const dragRef = useRef<DragState | null>(null);
  /** WebKitGTK: pointerdown may own the press — skip paired mousedown start. */
  const pointerOwnedThisPressRef = useRef(false);
  const [dragId, setDragId] = useState<NodeId | null>(null);
  const [overId, setOverId] = useState<NodeId | null>(null);

  const selectRow = useCallback(
    (row: SelectTargetRow) => {
      setSelection(
        workspace.sessionStore,
        new Set<NodeRef>([{ type: row.node.type, id: row.node.id }]),
      );
    },
    [workspace],
  );

  const handleToggleVisible = useCallback(
    (row: SelectTargetRow) => {
      workspace.runner.dispatch(
        setNodeVisible(row.node.id, !row.node.visible),
      );
    },
    [workspace],
  );

  const handleToggleLocked = useCallback(
    (row: SelectTargetRow) => {
      workspace.runner.dispatch(setNodeLocked(row.node.id, !row.node.locked));
    },
    [workspace],
  );

  const clearDrag = useCallback(() => {
    dragRef.current = null;
    setDragId(null);
    setOverId(null);
  }, []);

  const updateDragFromClientY = useCallback((clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;

    const deltaY = clientY - drag.startY;
    if (!drag.active) {
      if (Math.abs(deltaY) < OUTLINER_ROW_DRAG_THRESHOLD) return;
      drag.active = true;
      drag.selectOnRelease = false;
      setDragId(drag.sourceId);
      setOverId(drag.sourceId);
    }

    const nextOver = overIdAtClientY(
      rowsRef.current,
      rowElsRef.current,
      clientY,
      drag.sourceId,
    );
    if (nextOver !== drag.overId) {
      drag.overId = nextOver;
      setOverId(nextOver);
    }
  }, []);

  const commitDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) {
      clearDrag();
      return;
    }
    const source = rowsRef.current.find(
      (row) => row.node.id === drag.sourceId,
    );
    if (drag.active && drag.overId !== drag.sourceId && source) {
      dispatchMoveToTarget(workspace, source, drag.overId);
    } else if (!drag.active && drag.selectOnRelease && source) {
      selectRow(source);
    }
    clearDrag();
  }, [clearDrag, selectRow, workspace]);

  // Mouse fallback for WebKitGTK PE poison (pointermove may never arrive).
  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.mode !== 'mouse') return;
      updateDragFromClientY(event.clientY);
    };
    const onMouseUp = () => {
      const drag = dragRef.current;
      if (!drag || drag.mode !== 'mouse') {
        pointerOwnedThisPressRef.current = false;
        return;
      }
      commitDrag();
      pointerOwnedThisPressRef.current = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [commitDrag, updateDragFromClientY]);

  const beginDrag = (
    row: SelectTargetRow,
    clientY: number,
    mode: 'pointer' | 'mouse',
    pointerId: number,
  ) => {
    dragRef.current = {
      sourceId: row.node.id,
      startY: clientY,
      active: false,
      overId: row.node.id,
      mode,
      pointerId,
      selectOnRelease: true,
    };
  };

  const onRowPointerDown = (
    row: SelectTargetRow,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    pointerOwnedThisPressRef.current = true;
    beginDrag(row, event.clientY, 'pointer', event.pointerId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onRowPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.mode !== 'pointer') return;
    if (event.pointerId !== drag.pointerId) return;
    updateDragFromClientY(event.clientY);
  };

  const onRowPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.mode !== 'pointer') return;
    if (event.pointerId !== drag.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    commitDrag();
    pointerOwnedThisPressRef.current = false;
  };

  const onRowMouseDown = (
    row: SelectTargetRow,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    // Pointer path already owns this press (WebKitGTK paired events).
    if (pointerOwnedThisPressRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    beginDrag(row, event.clientY, 'mouse', -1);
  };

  return (
    <GlobalPanel ariaLabel="Outliner" onClose={onClose}>
      {rows.length === 0 ? (
        <p className="px-3 py-2 text-xs text-gray-500">No selectable nodes</p>
      ) : (
        <ol>
          {rows.map((row) => {
            const Icon = iconForNodeType(row.node.type);
            const selected = isRowSelected(
              sessionState.selection,
              row.node.id,
              row.node.type,
            );
            const label = selectTargetLabel(row.node);
            const rowIndex = rows.findIndex((r) => r.node.id === row.node.id);
            const canMoveUp = rowIndex > 0;
            const canMoveDown =
              rowIndex >= 0 && rowIndex < rows.length - 1;
            const isDragging = dragId === row.node.id;
            const isDropTarget =
              dragId != null &&
              overId === row.node.id &&
              dragId !== row.node.id;

            return (
              <li
                key={row.node.id}
                ref={(el) => {
                  if (el) {
                    rowElsRef.current.set(row.node.id, el);
                  } else {
                    rowElsRef.current.delete(row.node.id);
                  }
                }}
              >
                <div
                  className={`flex items-stretch ${
                    selected
                      ? CHROME_LIST_ITEM_ACTIVE
                      : CHROME_LIST_ITEM_DEFAULT
                  } ${isDragging ? 'opacity-50' : ''} ${
                    isDropTarget
                      ? 'border-t border-violet-300'
                      : 'border-t border-transparent'
                  }`}
                >
                  {/* Full-row drag surface (select on click); lock/eye stay outside. */}
                  <div
                    role="button"
                    tabIndex={0}
                    title={label}
                    aria-label={label}
                    className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center active:cursor-grabbing"
                    data-no-window-drag
                    onPointerDown={(event) => onRowPointerDown(row, event)}
                    onPointerMove={onRowPointerMove}
                    onPointerUp={onRowPointerUp}
                    onPointerCancel={onRowPointerUp}
                    onMouseDown={(event) => onRowMouseDown(row, event)}
                  >
                    <span
                      className="inline-flex shrink-0 items-center px-1 text-gray-400"
                      aria-hidden
                    >
                      <GripVertical size={12} />
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1 text-left text-xs">
                      <Icon size={14} className="shrink-0 text-gray-600" />
                      <span className="truncate">{label}</span>
                    </span>
                    <button
                      type="button"
                      title="Move toward front"
                      aria-label={`Move ${label} up`}
                      disabled={!canMoveUp}
                      className={`shrink-0 rounded p-0.5 ${
                        canMoveUp
                          ? 'cursor-pointer text-gray-600 hover:bg-gray-50'
                          : 'cursor-not-allowed text-gray-300'
                      }`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        dispatchNudge(workspace, rows, row, 'up');
                      }}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      title="Move toward back"
                      aria-label={`Move ${label} down`}
                      disabled={!canMoveDown}
                      className={`shrink-0 rounded p-0.5 ${
                        canMoveDown
                          ? 'cursor-pointer text-gray-600 hover:bg-gray-50'
                          : 'cursor-not-allowed text-gray-300'
                      }`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        dispatchNudge(workspace, rows, row, 'down');
                      }}
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <button
                    type="button"
                    title={
                      row.node.locked
                        ? 'Unlock (allow Select)'
                        : 'Lock (block Select)'
                    }
                    aria-label={
                      row.node.locked
                        ? 'Unlock (allow Select)'
                        : 'Lock (block Select)'
                    }
                    className="shrink-0 rounded p-1 text-gray-600 hover:bg-gray-50"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleLocked(row);
                    }}
                  >
                    {row.node.locked ? (
                      <Lock size={14} />
                    ) : (
                      <Unlock size={14} />
                    )}
                  </button>
                  <button
                    type="button"
                    title={row.node.visible ? 'Hide' : 'Show'}
                    aria-label={row.node.visible ? 'Hide' : 'Show'}
                    className="shrink-0 rounded p-1 text-gray-600 hover:bg-gray-50"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleVisible(row);
                    }}
                  >
                    {row.node.visible ? (
                      <Eye size={14} />
                    ) : (
                      <EyeOff size={14} />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </GlobalPanel>
  );
}
