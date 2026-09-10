import type { NodeId } from '../ids';
import type { DocumentState } from '../types';
import type { NodeRef } from '../types/nodes';
import { isNodeFocusType } from './nodeCapabilities';

export { isNodeFocusType } from './nodeCapabilities';

/**
 * **Node Focus** — Session selection includes at least one Sketch, Image, Frame,
 * or Sketch Group. Paint/erase keep selection, so a compatible latched tool still
 * counts as focus. Empty selection (or only GraphText / CanvasText) is not Node Focus.
 */
export function hasNodeFocus(
  selection: Iterable<NodeRef> | ReadonlySet<NodeRef>,
): boolean {
  for (const ref of selection) {
    if (isNodeFocusType(ref.type)) {
      return true;
    }
  }
  return false;
}

/**
 * Owner ids in Session selection that count as Node Focus.
 * Used for Agent Output underlay / chrome (Group only — not member Sketches).
 */
export function agentFocusOwnerIds(
  selection: Iterable<NodeRef> | ReadonlySet<NodeRef>,
): Set<NodeId> {
  const ids = new Set<NodeId>();
  for (const ref of selection) {
    if (isNodeFocusType(ref.type)) {
      ids.add(ref.id);
    }
  }
  return ids;
}

/**
 * Agent-mode Canvas solo visibility ids: focus owners plus Sketch Group members
 * so grouped ink stays visible while non-focus peers hide.
 */
export function agentSoloContentIds(
  selection: Iterable<NodeRef> | ReadonlySet<NodeRef>,
  state: Pick<DocumentState, 'nodes'>,
): Set<NodeId> {
  const ids = agentFocusOwnerIds(selection);
  for (const id of [...ids]) {
    const node = state.nodes[id];
    if (node?.type !== 'container') {
      continue;
    }
    for (const memberId of node.memberIds) {
      ids.add(memberId);
    }
  }
  return ids;
}
