import { createElement } from 'react';
import { resolvePaintSketchTarget } from '../../authoring/nodes/paintSketchTarget';
import {
  isCanvasFrameOutputViewActive,
  selectionAllowsTool,
} from '../../authoring/nodes/compatibleTools';
import { setActiveSketchId, setActiveTool } from '../../authoring/session';
import { clampSessionActivePaletteId } from '../../settings/activePaletteSession';
import { ensureActiveToolStaging } from '../../settings/configDomain';
import { PromptStripSlot } from '../prompt/PromptStripSlot';
import { resolvePromptEditorTarget } from '../prompt/promptGates';
import type { ToolContribution } from '../types';

export const selectTool: ToolContribution = {
  id: 'select',
  when: (context) => {
    if (context.workspaceKind !== 'canvas' && context.workspaceKind !== 'graph') {
      return 'hidden';
    }
    return context.activeTool === 'select' ? 'active' : 'idle';
  },
  activate: ({ workspace }) => {
    setActiveTool(workspace.sessionStore, 'select');
  },
  transformStrip: (context, tools) => {
    const target = resolvePromptEditorTarget(context);
    if (!target) {
      return tools;
    }
    const createId =
      context.workspaceKind === 'graph' ? 'createFrame' : 'createSketch';
    return tools.filter((tool) => tool.id === createId);
  },
  renderSlot: ({
    context,
    workspace,
    onPromptSubmit,
    onOpenPromptCompiler,
    promptCompilerOpen,
  }) => {
    const target = resolvePromptEditorTarget(context);
    if (!target) {
      return null;
    }
    return createElement(PromptStripSlot, {
      workspace,
      nodeRef: target,
      onPromptSubmit,
      onOpenPromptCompiler,
      promptCompilerOpen,
    });
  },
};

/**
 * Latch paint/erase. Keeps Session selection and palette/brush tips.
 * Exactly one selected Sketch → structure-target it (clamp tips into that set).
 * No Sketch selected → clear activeSketchId (paint create-on-stroke; erase no-op).
 *
 * Do not call activateSketch here — that rebinds to the Sketch’s first filled
 * brush and would retarget erase away from the tip chosen in Tool Config.
 */
export function activateDrawTool(
  workspace: Parameters<NonNullable<ToolContribution['activate']>>[0]['workspace'],
  tool: 'paint' | 'erase',
): void {
  const session = workspace.sessionStore.getState();
  const nodes = workspace.documentStore.getState().nodes;
  if (
    !selectionAllowsTool(Array.from(session.selection), tool, {
      frameOutputViewActive: isCanvasFrameOutputViewActive({
        nodes,
        canvasFrameId: session.canvasFrameId,
      }),
    })
  ) {
    return;
  }
  const selectedId = resolvePaintSketchTarget(session.selection, nodes);
  if (selectedId) {
    setActiveSketchId(workspace.sessionStore, selectedId);
    clampSessionActivePaletteId(workspace);
  } else {
    setActiveSketchId(workspace.sessionStore, null);
  }
  setActiveTool(workspace.sessionStore, tool);
  ensureActiveToolStaging(workspace.sessionStore);
}
