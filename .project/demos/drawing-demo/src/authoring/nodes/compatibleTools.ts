import type { ActiveTool } from '../types/session';
import type { NodeRef } from '../types/nodes';
import type { DocumentState } from '../types';
import type { NodeId } from '../ids';
import { compatibleToolsForNodeType } from './nodeCapabilities';
import { frameResultView } from './frameResultView';

export { compatibleToolsForNodeType } from './nodeCapabilities';

/** Tools that consult Node-owned compatible lists when selection is non-empty. */
const GATED_TOOLS = new Set<ActiveTool>(['paint', 'erase']);

export function isToolGatedByNodeCompatibility(tool: ActiveTool): boolean {
  return GATED_TOOLS.has(tool);
}

export type ToolCompatibilityPresentation = {
  /**
   * Canvas Edit Frame (`Session.canvasFrameId`) is showing output view.
   * Same paint/erase gate as selecting an Image (select-only).
   */
  frameOutputViewActive?: boolean;
};

/**
 * True when the Canvas Edit Frame exists and its `resultView` is output.
 * Source of truth for presentation-gated tools (not a host-local check).
 */
export function isCanvasFrameOutputViewActive(args: {
  nodes: DocumentState['nodes'];
  canvasFrameId: NodeId | null;
}): boolean {
  if (!args.canvasFrameId) {
    return false;
  }
  const frame = args.nodes[args.canvasFrameId];
  return frame?.type === 'frame' && frameResultView(frame) === 'output';
}

/**
 * Empty selection → allow (workspace owns strip), unless Canvas Frame output
 * view is active (then Image’s select-only list applies to gated tools).
 * Non-empty → every selected Node must list `tool` as compatible — same
 * Image gate when Canvas Frame output view is active.
 */
export function selectionAllowsTool(
  selectedNodeRefs: readonly NodeRef[],
  tool: ActiveTool,
  presentation?: ToolCompatibilityPresentation,
): boolean {
  if (
    presentation?.frameOutputViewActive &&
    isToolGatedByNodeCompatibility(tool)
  ) {
    return compatibleToolsForNodeType('image').includes(tool);
  }
  if (selectedNodeRefs.length === 0) {
    return true;
  }
  return selectedNodeRefs.every((ref) =>
    compatibleToolsForNodeType(ref.type).includes(tool),
  );
}
