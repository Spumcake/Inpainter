import type { ReactNode } from 'react';
import type { NodeId } from '../authoring/ids';
import type { AuthoringWorkspace } from '../authoring/workspace';
import type { ActiveTool } from '../authoring/types';
import type { NodeRef } from '../authoring/types/nodes';

export type WorkspaceKind = 'graph' | 'canvas';

export type ToolVisibility = 'hidden' | 'idle' | 'active' | 'disabled';

export type ToolbarContext = {
  workspaceKind: WorkspaceKind;
  activeTool: ActiveTool;
  selectionCount: number;
  selectedNodeRefs: NodeRef[];
  activeSketchId: NodeId | null;
  /** Session: Prompt Editor strip toggled open. */
  promptEditorOpen: boolean;
  /** Session: Agent mode — Prompt Editor may stay open without Select chrome. */
  agentMode: boolean;
  /**
   * Canvas Edit Frame is in output view — Node compatible-tools gate treats
   * paint/erase like Image (select-only).
   */
  frameOutputViewActive: boolean;
};

export type ResolvedToolItem = {
  id: string;
  visibility: Exclude<ToolVisibility, 'hidden'>;
};

export type ResolvedToolbarStrip = {
  tools: ResolvedToolItem[];
  slot: ReactNode | null;
  /** True when a tool transform replaced the default tool row. */
  transformed: boolean;
};

export type ToolActivateArgs = {
  context: ToolbarContext;
  workspace: AuthoringWorkspace;
};

export type ToolRenderSlotArgs = {
  context: ToolbarContext;
  workspace: AuthoringWorkspace;
  onPromptSubmit?: () => void;
  onOpenPromptCompiler?: () => void;
  promptCompilerOpen?: boolean;
};

export type ToolContribution = {
  id: string;
  when: (context: ToolbarContext) => ToolVisibility;
  activate?: (args: ToolActivateArgs) => void;
  transformStrip?: (
    context: ToolbarContext,
    tools: ResolvedToolItem[],
  ) => ResolvedToolItem[];
  renderSlot?: (args: ToolRenderSlotArgs) => ReactNode | null;
};
