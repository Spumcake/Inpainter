import { setActiveTool } from '../../authoring/session';
import type { AuthoringWorkspace } from '../../authoring/workspace';
import type { CanvasId } from '../../authoring/ids';
import type { Rect } from '../../authoring/types';
import { commitCreatedSketch as commitCreatedSketchNode } from '../../authoring/nodes/commitSketchCreate';
import type { ToolContribution } from '../types';

export const createSketchTool: ToolContribution = {
  id: 'createSketch',
  when: (context) => {
    if (context.workspaceKind !== 'canvas') {
      return 'hidden';
    }
    return context.activeTool === 'createSketch' ? 'active' : 'idle';
  },
  activate: ({ workspace }) => {
    setActiveTool(workspace.sessionStore, 'createSketch');
  },
};

/** Allocate palette + create Sketch Node, then latch Select with it selected. */
export function commitCreatedSketch(
  workspace: AuthoringWorkspace,
  canvasId: CanvasId,
  rect: Rect,
): void {
  commitCreatedSketchNode(workspace, canvasId, rect);
}

export { commitPaintCreatedSketch } from '../../authoring/nodes/commitSketchCreate';
