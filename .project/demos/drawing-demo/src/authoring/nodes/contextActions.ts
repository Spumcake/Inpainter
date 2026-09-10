import type { DocumentState } from '../types';
import type { CanvasId } from '../ids';
import type { NodeRef } from '../types/nodes';
import {
  contextActionsForNodeType,
  type AuthoringSurface,
  type ContextActionId,
} from './nodeCapabilities';
import { isClipboardPayload } from './clipboard';
import {
  canGroupSelection,
  canMakeContainer,
  canUngroupContainer,
  showGroupRow,
} from './container';

/** Empty Graph / Canvas hit — surface owns the list (v1: paste only). */
export function surfaceContextActions(
  _surface: AuthoringSurface,
): readonly ContextActionId[] {
  return ['paste'];
}

/** Multi-select: intersection of each selected Node's contextActions. */
export function intersectContextActions(
  refs: readonly NodeRef[],
): readonly ContextActionId[] {
  if (refs.length === 0) {
    return [];
  }
  let result: ContextActionId[] = [
    ...contextActionsForNodeType(refs[0]!.type),
  ];
  for (let i = 1; i < refs.length; i++) {
    const allowed = new Set(contextActionsForNodeType(refs[i]!.type));
    result = result.filter((action) => allowed.has(action));
  }
  return result;
}

export type StructuralContextActionId = 'group' | 'ungroup' | 'makeContainer';

export type ContextMenuRow = {
  action: ContextActionId;
  label: string;
  enabled: boolean;
  dividerBefore?: boolean;
};

export type StructuralContextMenuRow = {
  action: StructuralContextActionId;
  label: string;
  enabled: boolean;
  dividerBefore: true;
};

export type ContextMenuModel = {
  rows: ContextMenuRow[];
  structural: StructuralContextMenuRow[];
};

export type ResolveContextMenuModelArgs = {
  /** Focused authoring surface. */
  surface: AuthoringSurface;
  /** Current Session selection (empty → surface menu). */
  selection: readonly NodeRef[];
  nodes: DocumentState['nodes'];
  sketches: DocumentState['sketches'];
  clipboard: unknown;
  /** Focused Canvas when on Canvas surface. */
  canvasId?: CanvasId | null;
};

const ACTION_ORDER: readonly ContextActionId[] = [
  'cut',
  'copy',
  'paste',
  'delete',
  'hide',
  'lock',
];

function pasteEnabled(
  surface: AuthoringSurface,
  clipboard: unknown,
): boolean {
  if (!isClipboardPayload(clipboard)) {
    return false;
  }
  return clipboard.sourceSurface === surface;
}

function labelForAction(
  action: ContextActionId,
  nodes: DocumentState['nodes'],
  selection: readonly NodeRef[],
): string {
  if (action === 'hide') {
    const allVisible = selection.every(
      (ref) => nodes[ref.id]?.visible !== false,
    );
    return allVisible ? 'Hide' : 'Show';
  }
  if (action === 'lock') {
    const allLocked = selection.every(
      (ref) => nodes[ref.id]?.locked === true,
    );
    return allLocked ? 'Unlock' : 'Lock';
  }
  const labels: Record<ContextActionId, string> = {
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    delete: 'Delete',
    hide: 'Hide',
    lock: 'Lock',
  };
  return labels[action];
}

export function resolveContextMenuModel(
  args: ResolveContextMenuModelArgs,
): ContextMenuModel {
  const hasSelection = args.selection.length > 0;
  const canPaste = pasteEnabled(args.surface, args.clipboard);

  const allowedActions = hasSelection
    ? intersectContextActions(args.selection)
    : surfaceContextActions(args.surface);

  const rows: ContextMenuRow[] = ACTION_ORDER.filter((action) =>
    allowedActions.includes(action),
  ).map(
    (action) => {
      let enabled = true;
      if (action === 'cut' || action === 'copy') {
        enabled = hasSelection;
      } else if (action === 'paste') {
        enabled = canPaste;
      } else if (!hasSelection) {
        enabled = false;
      }
      return {
        action,
        label: labelForAction(action, args.nodes, args.selection),
        enabled,
      };
    },
  );

  const structural: StructuralContextMenuRow[] = [];
  const docState = { nodes: args.nodes, sketches: args.sketches };

  if (
    args.surface === 'canvas' &&
    args.canvasId != null &&
    canMakeContainer(docState, args.selection, args.canvasId)
  ) {
    structural.push({
      action: 'makeContainer',
      label: 'Make Container',
      enabled: true,
      dividerBefore: true,
    });
  }

  if (
    args.surface === 'canvas' &&
    args.canvasId != null &&
    showGroupRow({ nodes: args.nodes }, args.selection, args.canvasId)
  ) {
    structural.push({
      action: 'group',
      label: 'Group',
      enabled: canGroupSelection(
        { nodes: args.nodes },
        args.selection,
        args.canvasId,
      ),
      dividerBefore: true,
    });
  }

  if (canUngroupContainer({ nodes: args.nodes }, args.selection)) {
    structural.push({
      action: 'ungroup',
      label: 'Ungroup',
      enabled: true,
      dividerBefore: true,
    });
  }

  return { rows, structural };
}
