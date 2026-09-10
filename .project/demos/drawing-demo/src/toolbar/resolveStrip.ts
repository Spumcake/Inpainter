import type { AuthoringWorkspace } from '../authoring/workspace';
import { TOOL_REGISTRY } from './registry';
import type {
  ResolvedToolItem,
  ResolvedToolbarStrip,
  ToolContribution,
  ToolVisibility,
  ToolbarContext,
} from './types';

function isVisible(visibility: ToolVisibility): visibility is ResolvedToolItem['visibility'] {
  return visibility !== 'hidden';
}

function collectVisibleTools(
  registry: ToolContribution[],
  context: ToolbarContext,
): ResolvedToolItem[] {
  const items: ResolvedToolItem[] = [];
  for (const tool of registry) {
    const visibility = tool.when(context);
    if (isVisible(visibility)) {
      items.push({ id: tool.id, visibility });
    }
  }
  return items;
}

function applyStripTransforms(
  registry: ToolContribution[],
  context: ToolbarContext,
  tools: ResolvedToolItem[],
): { tools: ResolvedToolItem[]; transformed: boolean } {
  let next = tools;
  let transformed = false;
  for (const tool of registry) {
    if (!tool.transformStrip) {
      continue;
    }
    const result = tool.transformStrip(context, next);
    if (result !== next) {
      transformed = true;
    }
    next = result;
  }
  return { tools: next, transformed };
}

type ResolveSlotOptions = {
  onPromptSubmit?: () => void;
  onOpenPromptCompiler?: () => void;
  promptCompilerOpen?: boolean;
};

function resolveSlot(
  registry: ToolContribution[],
  context: ToolbarContext,
  workspace: AuthoringWorkspace,
  options: ResolveSlotOptions = {},
): ResolvedToolbarStrip['slot'] {
  for (const tool of registry) {
    if (!tool.renderSlot) {
      continue;
    }
    const slot = tool.renderSlot({
      context,
      workspace,
      onPromptSubmit: options.onPromptSubmit,
      onOpenPromptCompiler: options.onOpenPromptCompiler,
      promptCompilerOpen: options.promptCompilerOpen,
    });
    if (slot) {
      return slot;
    }
  }
  return null;
}

export function resolveToolbarStrip(
  context: ToolbarContext,
  registry: ToolContribution[] = TOOL_REGISTRY,
  workspace?: AuthoringWorkspace,
  options: ResolveSlotOptions = {},
): ResolvedToolbarStrip {
  const visible = collectVisibleTools(registry, context);
  const { tools, transformed } = applyStripTransforms(registry, context, visible);
  return {
    tools,
    slot: workspace
      ? resolveSlot(registry, context, workspace, options)
      : null,
    transformed,
  };
}
