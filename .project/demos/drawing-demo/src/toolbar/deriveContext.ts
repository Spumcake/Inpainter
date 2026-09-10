import type { DocumentState, SessionState } from '../authoring/types';
import type { NodeRef } from '../authoring/types/nodes';
import { isCanvasFrameOutputViewActive } from '../authoring/nodes/compatibleTools';
import type { ToolbarContext, WorkspaceKind } from './types';

export function workspaceKindFromViewFocus(
  canvasId: SessionState['viewFocus']['canvasId'],
): WorkspaceKind {
  return canvasId ? 'canvas' : 'graph';
}

export function deriveToolbarContext(
  session: SessionState,
  document?: Pick<DocumentState, 'nodes'>,
): ToolbarContext {
  const selectedNodeRefs = Array.from(session.selection) as NodeRef[];
  return {
    workspaceKind: workspaceKindFromViewFocus(session.viewFocus.canvasId),
    activeTool: session.activeTool,
    selectionCount: session.selection.size,
    selectedNodeRefs,
    activeSketchId: session.activeSketchId,
    promptEditorOpen: session.promptEditorOpen,
    agentMode: session.agentMode,
    frameOutputViewActive: document
      ? isCanvasFrameOutputViewActive({
          nodes: document.nodes,
          canvasFrameId: session.canvasFrameId,
        })
      : false,
  };
}
