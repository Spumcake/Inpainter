import { activateDrawTool } from './selectTool';
import { selectionAllowsTool } from '../../authoring/nodes/compatibleTools';
import type { ToolContribution } from '../types';

export const paintTool: ToolContribution = {
  id: 'paint',
  when: (context) => {
    if (context.workspaceKind !== 'canvas') {
      return 'hidden';
    }
    if (
      !selectionAllowsTool(context.selectedNodeRefs, 'paint', {
        frameOutputViewActive: context.frameOutputViewActive,
      })
    ) {
      return 'disabled';
    }
    return context.activeTool === 'paint' ? 'active' : 'idle';
  },
  activate: ({ workspace }) => {
    activateDrawTool(workspace, 'paint');
  },
};
