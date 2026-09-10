import { activateDrawTool } from './selectTool';
import { selectionAllowsTool } from '../../authoring/nodes/compatibleTools';
import type { ToolContribution } from '../types';

export const eraseTool: ToolContribution = {
  id: 'erase',
  when: (context) => {
    if (context.workspaceKind !== 'canvas') {
      return 'hidden';
    }
    if (
      !selectionAllowsTool(context.selectedNodeRefs, 'erase', {
        frameOutputViewActive: context.frameOutputViewActive,
      })
    ) {
      return 'disabled';
    }
    return context.activeTool === 'erase' ? 'active' : 'idle';
  },
  activate: ({ workspace }) => {
    activateDrawTool(workspace, 'erase');
  },
};
