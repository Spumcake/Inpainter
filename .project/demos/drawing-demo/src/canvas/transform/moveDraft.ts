import { frameCardRect, imageRect } from '../../authoring/document';
import type { Node, NodeRef, Rect, ContainerNode } from '../../authoring/types';
import { nodeRefKey } from '../../authoring/types';
import type { NodeId } from '../../authoring/ids';
import { mapMemberRectThroughGroupResize } from '../../authoring/nodes/container';
import { applyMoveDelta } from './resizeMath';

/** Body-down: keep full selection if target already selected; else singleton. */
export function moveSelectionRefs(
  selection: readonly NodeRef[],
  target: NodeRef,
): NodeRef[] {
  const key = nodeRefKey(target);
  if (selection.some((ref) => nodeRefKey(ref) === key)) {
    return [...selection];
  }
  return [target];
}

/** Seed Group + member Sketch rects so live ink preview follows the same draft path. */
function seedSketchGroupStartRects(
  map: Map<string, Rect>,
  nodes: Record<NodeId, Node>,
  group: ContainerNode,
): void {
  map.set(String(group.id), { ...group.canvas });
  for (const memberId of group.memberIds) {
    const member = nodes[memberId];
    if (
      !member ||
      member.type !== 'sketch' ||
      member.locked ||
      member.visible === false
    ) {
      continue;
    }
    map.set(String(member.id), { ...member.canvas });
  }
}

export function startRectsForMoveRefs(
  nodes: Record<NodeId, Node>,
  refs: readonly NodeRef[],
  frameGeometry: 'graph' | 'crop' = 'graph',
): Map<string, Rect> {
  const map = new Map<string, Rect>();
  for (const ref of refs) {
    const node = nodes[ref.id];
    if (!node || node.locked || node.visible === false) {
      continue;
    }
    if (ref.type === 'sketch' && node.type === 'sketch') {
      map.set(String(node.id), { ...node.canvas });
    } else if (ref.type === 'container' && node.type === 'container') {
      seedSketchGroupStartRects(map, nodes, node);
    } else if (ref.type === 'image' && node.type === 'image') {
      map.set(String(node.id), imageRect(node));
    } else if (ref.type === 'frame' && node.type === 'frame') {
      map.set(
        String(node.id),
        frameGeometry === 'graph'
          ? frameCardRect(node)
          : { ...node.crop },
      );
    }
  }
  return map;
}

/** Start rects for Group resize — Group + members (same draft path as multi-Sketch). */
export function startRectsForGroupResize(
  nodes: Record<NodeId, Node>,
  group: ContainerNode,
): Map<string, Rect> {
  const map = new Map<string, Rect>();
  seedSketchGroupStartRects(map, nodes, group);
  return map;
}

/** Live resize draft: map every member through the Group old→next transform. */
export function draftRectsForGroupResize(
  startRects: ReadonlyMap<string, Rect>,
  groupId: string,
  groupNext: Rect,
): Map<string, Rect> {
  const groupOld = startRects.get(groupId);
  const next = new Map<string, Rect>();
  next.set(groupId, groupNext);
  if (!groupOld) {
    return next;
  }
  for (const [id, rect] of startRects) {
    if (id === groupId) continue;
    next.set(id, mapMemberRectThroughGroupResize(groupOld, groupNext, rect));
  }
  return next;
}

export function translatedDraftById(
  startRects: ReadonlyMap<string, Rect>,
  dx: number,
  dy: number,
): Map<string, Rect> {
  const next = new Map<string, Rect>();
  for (const [id, rect] of startRects) {
    next.set(id, applyMoveDelta(rect, dx, dy));
  }
  return next;
}

/** Shared live transform draft (move N≥1 and sole resize). */
export type SurfaceTransformDraft = {
  baseById: Map<string, Rect>;
  draftById: Map<string, Rect>;
};

export function surfaceDraftFromMaps(
  baseById: Map<string, Rect>,
  draftById: Map<string, Rect>,
): SurfaceTransformDraft {
  return { baseById, draftById };
}

export function soleSurfaceDraft(
  id: string,
  base: Rect,
  next: Rect,
): SurfaceTransformDraft {
  return {
    baseById: new Map([[id, base]]),
    draftById: new Map([[id, next]]),
  };
}
