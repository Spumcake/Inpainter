import { isPromptEditorEligible as isEligibleOnSurface } from '../../authoring/nodes/promptEligibility';
import type { NodeRef } from '../../authoring/types/nodes';
import type { ToolbarContext, WorkspaceKind } from '../types';

/**
 * Frame Prompt Editor is Graph-only. Sketch is Canvas-only.
 * Image is eligible on Canvas and Graph.
 * Driven by Node capability `promptSurfaces`.
 */
export function isPromptEditorEligible(
  type: NodeRef['type'],
  workspaceKind: WorkspaceKind,
): boolean {
  return isEligibleOnSurface(type, workspaceKind);
}

/** Select or Agent mode + exactly one eligible Node (toggle may still be closed). */
export function resolvePromptableSelection(
  context: Pick<
    ToolbarContext,
    | 'activeTool'
    | 'agentMode'
    | 'selectionCount'
    | 'selectedNodeRefs'
    | 'workspaceKind'
  >,
): NodeRef | null {
  if (context.activeTool !== 'select' && !context.agentMode) {
    return null;
  }
  if (context.selectionCount !== 1) {
    return null;
  }
  const ref = context.selectedNodeRefs[0];
  if (!ref || !isPromptEditorEligible(ref.type, context.workspaceKind)) {
    return null;
  }
  return ref;
}

/** Prompt Editor strip: eligible selection + Session `promptEditorOpen`. */
export function resolvePromptEditorTarget(
  context: ToolbarContext,
): NodeRef | null {
  if (!context.promptEditorOpen) {
    return null;
  }
  return resolvePromptableSelection(context);
}
