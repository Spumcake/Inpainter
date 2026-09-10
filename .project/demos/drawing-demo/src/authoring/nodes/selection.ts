import type { SessionStore } from '../session/sessionStore';
import { hasNodeFocus } from './nodeFocus';
import type { NodeRef } from '../types/nodes';
import { nodeRefKey } from '../types/nodes';

/** Plain clone — never store immer drafts in the Session selection Set. */
function cloneNodeRef(ref: NodeRef): NodeRef {
  return { type: ref.type, id: ref.id };
}

function cloneSelection(refs: Iterable<NodeRef>): Set<NodeRef> {
  const next = new Set<NodeRef>();
  for (const ref of refs) {
    next.add(cloneNodeRef(ref));
  }
  return next;
}

export function clearSelection(store: SessionStore): void {
  store.setState((state) => {
    if (state.agentMode) {
      return;
    }
    state.selection = new Set<NodeRef>();
  });
}

export function addToSelection(store: SessionStore, ref: NodeRef): void {
  store.setState((state) => {
    const next = cloneSelection(state.selection);
    next.add(cloneNodeRef(ref));
    state.selection = next;
  });
}

export function removeFromSelection(store: SessionStore, ref: NodeRef): void {
  store.setState((state) => {
    const key = nodeRefKey(ref);
    const next = new Set<NodeRef>();
    for (const item of state.selection) {
      if (nodeRefKey(item) !== key) {
        next.add(cloneNodeRef(item));
      }
    }
    if (state.agentMode && !hasNodeFocus(next)) {
      return;
    }
    state.selection = next;
  });
}

export function toggleSelection(store: SessionStore, ref: NodeRef): void {
  store.setState((state) => {
    const key = nodeRefKey(ref);
    let found = false;
    const next = new Set<NodeRef>();
    for (const item of state.selection) {
      if (nodeRefKey(item) === key) {
        found = true;
      } else {
        next.add(cloneNodeRef(item));
      }
    }
    if (!found) {
      next.add(cloneNodeRef(ref));
    }
    if (state.agentMode && !hasNodeFocus(next)) {
      return;
    }
    state.selection = next;
  });
}

export function isSelected(store: SessionStore, ref: NodeRef): boolean {
  const key = nodeRefKey(ref);
  for (const item of store.getState().selection) {
    if (nodeRefKey(item) === key) {
      return true;
    }
  }
  return false;
}

/** Clone into a fresh Set of plain refs (for SessionStore / surface resume). */
export function cloneSelectionSet(refs: Iterable<NodeRef>): Set<NodeRef> {
  return cloneSelection(refs);
}

/**
 * Selection to use when opening the node context menu.
 * Keep full set when target is already selected; else singleton.
 */
export function selectionForNodeContextMenu(
  selection: Iterable<NodeRef>,
  target: NodeRef,
): Set<NodeRef> {
  const key = nodeRefKey(target);
  for (const ref of selection) {
    if (nodeRefKey(ref) === key) {
      return cloneSelection(selection);
    }
  }
  return cloneSelectionSet([target]);
}
