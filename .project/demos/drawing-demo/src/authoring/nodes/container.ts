import { paintHullOfSketchPaths } from '../sketch/bounds';
import type { CanvasId, NodeId } from '../ids';
import type {
  DocumentState,
  Node,
  NodeRef,
  Rect,
  ContainerNode,
  SketchNode,
  SketchData,
} from '../types';

export function isContainer(node: Node | undefined): node is ContainerNode {
  return node?.type === 'container';
}

/** @deprecated Use isContainer */
export const isSketchGroup = isContainer;

export function listContainersForCanvas(
  state: Pick<DocumentState, 'nodes'>,
  canvasId: CanvasId,
): ContainerNode[] {
  const containers: ContainerNode[] = [];
  for (const node of Object.values(state.nodes)) {
    if (node.type === 'container' && node.canvasId === canvasId) {
      containers.push(node);
    }
  }
  return containers;
}

/** @deprecated Use listContainersForCanvas */
export const listSketchGroupsForCanvas = listContainersForCanvas;

/** Parent Container id for a Sketch, if any. Membership lives on the Container. */
export function containerIdForSketch(
  state: Pick<DocumentState, 'nodes'>,
  sketchId: NodeId,
): NodeId | null {
  for (const node of Object.values(state.nodes)) {
    if (node.type === 'container' && node.memberIds.includes(sketchId)) {
      return node.id;
    }
  }
  return null;
}

/** @deprecated Use containerIdForSketch */
export const groupIdForSketch = containerIdForSketch;

export function isSketchContained(
  state: Pick<DocumentState, 'nodes'>,
  sketchId: NodeId,
): boolean {
  return containerIdForSketch(state, sketchId) != null;
}

/** @deprecated Use isSketchContained */
export const isSketchGrouped = isSketchContained;

export function sketchHasInkPaths(
  sketchData: SketchData | undefined,
  sketchId: NodeId,
): boolean {
  if (!sketchData) {
    return false;
  }
  return paintHullOfSketchPaths(sketchData, sketchId, sketchId) != null;
}

export function unionBoundsForRects(rects: readonly Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function memberSketchesForContainer(
  state: Pick<DocumentState, 'nodes'>,
  container: ContainerNode,
): SketchNode[] {
  const sketches: SketchNode[] = [];
  for (const memberId of container.memberIds) {
    const node = state.nodes[memberId];
    if (node?.type === 'sketch') {
      sketches.push(node);
    }
  }
  return sketches;
}

/** @deprecated Use memberSketchesForContainer */
export const memberSketchesForGroup = memberSketchesForContainer;

export function recomputeContainerBounds(
  state: Pick<DocumentState, 'nodes'>,
  container: ContainerNode,
): Rect {
  const memberRects = memberSketchesForContainer(state, container).map(
    (sketch) => sketch.canvas,
  );
  return unionBoundsForRects(memberRects);
}

/** @deprecated Use recomputeContainerBounds */
export const recomputeGroupBounds = recomputeContainerBounds;

/** After a member Sketch geometry changes, refresh parent Container union bounds. */
export function syncParentContainerBounds(
  state: { nodes: DocumentState['nodes'] },
  sketchId: NodeId,
): void {
  const containerId = containerIdForSketch(state, sketchId);
  if (containerId == null) {
    return;
  }
  const container = state.nodes[containerId];
  if (container?.type !== 'container') {
    return;
  }
  if (container.memberIds.length === 0) {
    return;
  }
  container.canvas = recomputeContainerBounds(state, container);
}

/** @deprecated Use syncParentContainerBounds */
export const syncParentGroupBounds = syncParentContainerBounds;

/** Map a member rect through a container bounds resize (uniform scale from old → new). */
export function mapMemberRectThroughGroupResize(
  groupOld: Rect,
  groupNew: Rect,
  memberRect: Rect,
): Rect {
  if (groupOld.width <= 0 || groupOld.height <= 0) {
    return { ...memberRect };
  }
  const sx = groupNew.width / groupOld.width;
  const sy = groupNew.height / groupOld.height;
  return {
    x: groupNew.x + (memberRect.x - groupOld.x) * sx,
    y: groupNew.y + (memberRect.y - groupOld.y) * sy,
    width: Math.max(1, memberRect.width * sx),
    height: Math.max(1, memberRect.height * sy),
  };
}

/** Expand delete ids: Container → Container + all member Sketches. */
export function expandDeleteIds(
  state: Pick<DocumentState, 'nodes'>,
  ids: readonly NodeId[],
): NodeId[] {
  const expanded = new Set(ids);
  for (const id of ids) {
    const node = state.nodes[id];
    if (node?.type === 'container') {
      for (const memberId of node.memberIds) {
        expanded.add(memberId);
      }
    }
  }
  return [...expanded];
}

/** Copy payload: Container selection includes member Sketch clones. */
export function expandClipboardNodeIds(
  state: Pick<DocumentState, 'nodes'>,
  ids: readonly NodeId[],
): NodeId[] {
  const result: NodeId[] = [];
  const seen = new Set<NodeId>();
  const memberOfCopiedContainer = new Set<NodeId>();

  for (const id of ids) {
    const node = state.nodes[id];
    if (node?.type === 'container') {
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
      for (const memberId of node.memberIds) {
        memberOfCopiedContainer.add(memberId);
        if (!seen.has(memberId)) {
          seen.add(memberId);
          result.push(memberId);
        }
      }
    }
  }

  for (const id of ids) {
    if (memberOfCopiedContainer.has(id)) {
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }

  return result;
}

export type GroupSelectionParts = {
  containers: ContainerNode[];
  freeSketches: SketchNode[];
};

export function parseGroupSelection(
  state: Pick<DocumentState, 'nodes'>,
  selection: readonly NodeRef[],
  canvasId: CanvasId,
): GroupSelectionParts | null {
  if (selection.length < 2) {
    return null;
  }
  const containers: ContainerNode[] = [];
  const freeSketches: SketchNode[] = [];
  for (const ref of selection) {
    if (ref.type !== 'sketch' && ref.type !== 'container') {
      return null;
    }
    const node = state.nodes[ref.id];
    if (!node) {
      return null;
    }
    if (node.type === 'container') {
      if (node.canvasId !== canvasId || node.locked || node.visible === false) {
        return null;
      }
      containers.push(node);
      continue;
    }
    if (node.type !== 'sketch') {
      return null;
    }
    if (node.canvasId !== canvasId || node.locked || node.visible === false) {
      return null;
    }
    if (isSketchContained(state, ref.id)) {
      return null;
    }
    freeSketches.push(node);
  }
  return { containers, freeSketches };
}

/** True when Group action should be enabled (not merely visible). */
export function canGroupSelection(
  state: Pick<DocumentState, 'nodes'>,
  selection: readonly NodeRef[],
  canvasId: CanvasId,
): boolean {
  const parts = parseGroupSelection(state, selection, canvasId);
  if (!parts) {
    return false;
  }
  const { containers, freeSketches } = parts;
  if (containers.length >= 2) {
    return false;
  }
  if (containers.length === 1) {
    return freeSketches.length >= 1;
  }
  return freeSketches.length >= 2;
}

/** @deprecated Use canGroupSelection */
export function canGroupSketches(
  state: Pick<DocumentState, 'nodes'>,
  selection: readonly NodeRef[],
  canvasId: CanvasId,
): boolean {
  return canGroupSelection(state, selection, canvasId);
}

/** True when Group row should appear (including disabled ≥2 containers). */
export function showGroupRow(
  state: Pick<DocumentState, 'nodes'>,
  selection: readonly NodeRef[],
  canvasId: CanvasId,
): boolean {
  return parseGroupSelection(state, selection, canvasId) != null;
}

export function canUngroupContainer(
  state: Pick<DocumentState, 'nodes'>,
  selection: readonly NodeRef[],
): boolean {
  if (selection.length !== 1) {
    return false;
  }
  const ref = selection[0]!;
  if (ref.type !== 'container') {
    return false;
  }
  const node = state.nodes[ref.id];
  return node?.type === 'container' && node.memberIds.length >= 1;
}

/** @deprecated Use canUngroupContainer */
export const canUngroupSketchGroup = canUngroupContainer;

export function canMakeContainer(
  state: Pick<DocumentState, 'nodes' | 'sketches'>,
  selection: readonly NodeRef[],
  canvasId: CanvasId,
): boolean {
  if (selection.length !== 1) {
    return false;
  }
  const ref = selection[0]!;
  if (ref.type !== 'sketch') {
    return false;
  }
  const node = state.nodes[ref.id];
  if (!node || node.type !== 'sketch') {
    return false;
  }
  if (node.canvasId !== canvasId || node.locked || node.visible === false) {
    return false;
  }
  if (isSketchContained(state, ref.id)) {
    return false;
  }
  const sketchData = state.sketches[canvasId];
  return !sketchHasInkPaths(sketchData, ref.id);
}

export type CanvasSelectEntry =
  | { kind: 'sketch'; node: SketchNode }
  | { kind: 'container'; node: ContainerNode }
  | { kind: 'image'; node: import('../types').ImageNode };

/**
 * Canvas Select projection — collapsed vs container-edit hit rules.
 * Members hidden when their Container is collapsed; in container-edit only that Container's members show.
 */
export function canvasSelectEntries(
  state: Pick<DocumentState, 'nodes'>,
  canvasId: CanvasId,
  containerEditId: NodeId | null,
): CanvasSelectEntry[] {
  const entries: CanvasSelectEntry[] = [];

  if (containerEditId != null) {
    const container = state.nodes[containerEditId];
    if (container?.type === 'container' && container.canvasId === canvasId) {
      for (const memberId of container.memberIds) {
        const node = state.nodes[memberId];
        if (node?.type === 'sketch') {
          entries.push({ kind: 'sketch', node });
        }
      }
    }
    return entries;
  }

  const containedSketchIds = new Set<NodeId>();
  for (const container of listContainersForCanvas(state, canvasId)) {
    for (const memberId of container.memberIds) {
      containedSketchIds.add(memberId);
    }
    entries.push({ kind: 'container', node: container });
  }

  for (const node of Object.values(state.nodes)) {
    if (node.type === 'sketch' && node.canvasId === canvasId) {
      if (!containedSketchIds.has(node.id)) {
        entries.push({ kind: 'sketch', node });
      }
    } else if (
      node.type === 'image' &&
      node.placement.kind === 'canvas' &&
      node.placement.canvasId === canvasId
    ) {
      entries.push({ kind: 'image', node });
    }
  }

  return entries;
}
