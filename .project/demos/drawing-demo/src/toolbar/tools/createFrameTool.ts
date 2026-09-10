import { setActiveTool } from '../../authoring/session';
import type { AuthoringWorkspace } from '../../authoring/workspace';
import type { GraphId } from '../../authoring/ids';
import type { Rect } from '../../authoring/types';
import { commitCreatedFrame as commitCreatedFrameNode } from '../../authoring/nodes/commitFrameCreate';
import type { ToolContribution } from '../types';

export const createFrameTool: ToolContribution = {
  id: 'createFrame',
  when: (context) => {
    if (context.workspaceKind !== 'graph') {
      return 'hidden';
    }
    return context.activeTool === 'createFrame' ? 'active' : 'idle';
  },
  activate: ({ workspace }) => {
    setActiveTool(workspace.sessionStore, 'createFrame');
  },
};

/** Create Canvas + Frame from Graph drag rect, then latch Select with the Frame selected. */
export function commitCreatedFrame(
  workspace: AuthoringWorkspace,
  graphId: GraphId,
  graphRect: Rect,
): void {
  commitCreatedFrameNode(workspace, graphId, { graphRect });
}
