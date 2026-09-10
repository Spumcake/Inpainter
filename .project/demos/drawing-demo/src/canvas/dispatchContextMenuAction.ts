import {
  copyNodes,
  deleteNodes,
  expandClipboardNodeIds,
  groupSelection,
  makeContainerFromSketch,
  parseGroupSelection,
  pasteNodesCommand,
  resolveContextMenuModel,
  setNodeLocked,
  setNodeVisible,
  setSelection,
  ungroupContainer,
  type AuthoringSurface,
  type Command,
  type ContextActionId,
  type NodeId,
  type Point2D,
} from '../authoring';
import type { CanvasId } from '../authoring/ids';
import type { StructuralContextActionId } from '../authoring/nodes/contextActions';
import type { NodeRef } from '../authoring/types/nodes';
import type { AuthoringWorkspace } from '../authoring/workspace';

export function focusedAuthoringSurface(
  workspace: AuthoringWorkspace,
): AuthoringSurface {
  return workspace.sessionStore.getState().viewFocus.canvasId != null
    ? 'canvas'
    : 'graph';
}

export function resolveAuthoringContextMenuRows(
  workspace: AuthoringWorkspace,
  kind: 'node' | 'surface',
) {
  const session = workspace.sessionStore.getState();
  const document = workspace.documentStore.getState();
  const surface = focusedAuthoringSurface(workspace);
  const selection =
    kind === 'surface' ? [] : Array.from(session.selection);
  return resolveContextMenuModel({
    surface,
    selection,
    nodes: document.nodes,
    sketches: document.sketches,
    clipboard: session.clipboard,
    canvasId: session.viewFocus.canvasId,
  });
}

function batchVisible(ids: NodeId[], visible: boolean): Command {
  return {
    label: visible
      ? ids.length === 1
        ? 'Show node'
        : 'Hide nodes'
      : ids.length === 1
        ? 'Hide node'
        : 'Hide nodes',
    apply: (draft) => {
      for (const id of ids) {
        setNodeVisible(id, visible).apply(draft);
      }
    },
  };
}

function batchLocked(ids: NodeId[], locked: boolean): Command {
  return {
    label: locked
      ? ids.length === 1
        ? 'Lock node'
        : 'Lock nodes'
      : ids.length === 1
        ? 'Unlock node'
        : 'Unlock nodes',
    apply: (draft) => {
      for (const id of ids) {
        setNodeLocked(id, locked).apply(draft);
      }
    },
  };
}

export type DispatchContextMenuActionOptions = {
  /** World-space paste anchor from the right-click that opened the menu. */
  pasteAt?: Point2D;
};

export type MenuActionId = ContextActionId | StructuralContextActionId;

function findGroupedContainerAfterDispatch(
  workspace: AuthoringWorkspace,
  selection: readonly NodeRef[],
  canvasId: CanvasId,
): { id: NodeId } | null {
  const document = workspace.documentStore.getState();
  const parts = parseGroupSelection(document, selection, canvasId);
  if (!parts) {
    return null;
  }
  if (parts.containers.length === 1) {
    return { id: parts.containers[0]!.id };
  }
  const sketchIds = new Set(parts.freeSketches.map((s) => s.id));
  return (
    Object.values(document.nodes).find(
      (node) =>
        node.type === 'container' &&
        node.canvasId === canvasId &&
        node.memberIds.length >= sketchIds.size &&
        [...sketchIds].every((memberId) => node.memberIds.includes(memberId)),
    ) ?? null
  );
}

/**
 * Dispatch a context-menu / shortcut action using existing Node / Session APIs.
 * Returns false when the action is ineligible (no-op).
 */
export function dispatchContextMenuAction(
  workspace: AuthoringWorkspace,
  action: MenuActionId,
  kind: 'node' | 'surface' = 'node',
  options: DispatchContextMenuActionOptions = {},
): boolean {
  const model = resolveAuthoringContextMenuRows(workspace, kind);
  const standardRow = model.rows.find((entry) => entry.action === action);
  const structuralRow = model.structural.find((entry) => entry.action === action);
  const row = standardRow ?? structuralRow;
  if (!row?.enabled) {
    return false;
  }

  const session = workspace.sessionStore.getState();
  const document = workspace.documentStore.getState();
  const surface = focusedAuthoringSurface(workspace);
  const selection = kind === 'surface' ? [] : Array.from(session.selection);
  const ids = selection.map((ref) => ref.id);
  const canvasId = session.viewFocus.canvasId;

  if (action === 'makeContainer') {
    const sketchId = ids[0];
    if (!sketchId) {
      return false;
    }
    workspace.runner.dispatch(makeContainerFromSketch(sketchId));
    setSelection(
      workspace.sessionStore,
      new Set([{ type: 'container', id: sketchId }]),
    );
    return true;
  }

  if (action === 'group') {
    if (canvasId == null) {
      return false;
    }
    workspace.runner.dispatch(groupSelection(selection, canvasId));
    const created = findGroupedContainerAfterDispatch(
      workspace,
      selection,
      canvasId,
    );
    if (created) {
      setSelection(
        workspace.sessionStore,
        new Set([{ type: 'container', id: created.id }]),
      );
    }
    return true;
  }

  if (action === 'ungroup') {
    const containerId = ids[0];
    if (!containerId) {
      return false;
    }
    const container = document.nodes[containerId];
    if (container?.type !== 'container') {
      return false;
    }
    const memberRefs = container.memberIds.map((id) => ({
      type: 'sketch' as const,
      id,
    }));
    workspace.runner.dispatch(ungroupContainer(containerId));
    if (session.containerEditId === containerId) {
      workspace.sessionStore.setState((state) => {
        state.containerEditId = null;
      });
    }
    setSelection(workspace.sessionStore, new Set(memberRefs));
    return true;
  }

  switch (action) {
    case 'cut': {
      const expanded = expandClipboardNodeIds(document, ids);
      copyNodes(workspace.sessionStore, workspace.documentStore, expanded, surface);
      workspace.runner.dispatch(deleteNodes(ids));
      return true;
    }
    case 'copy': {
      const expanded = expandClipboardNodeIds(document, ids);
      copyNodes(workspace.sessionStore, workspace.documentStore, expanded, surface);
      return true;
    }
    case 'paste': {
      workspace.runner.dispatch(
        pasteNodesCommand(session.clipboard, {
          surface,
          at: options.pasteAt,
          targetCanvasId: surface === 'canvas' ? canvasId ?? undefined : undefined,
        }),
      );
      return true;
    }
    case 'delete': {
      workspace.runner.dispatch(deleteNodes(ids));
      return true;
    }
    case 'hide': {
      const allVisible = ids.every(
        (id) => document.nodes[id]?.visible !== false,
      );
      workspace.runner.dispatch(batchVisible(ids, !allVisible));
      return true;
    }
    case 'lock': {
      const allLocked = ids.every(
        (id) => document.nodes[id]?.locked === true,
      );
      workspace.runner.dispatch(batchLocked(ids, !allLocked));
      return true;
    }
  }
  return false;
}

export function dispatchGroupShortcut(
  workspace: AuthoringWorkspace,
  action: 'group' | 'ungroup',
): boolean {
  const session = workspace.sessionStore.getState();
  const kind = session.selection.size === 0 ? 'surface' : 'node';
  return dispatchContextMenuAction(workspace, action, kind);
}
