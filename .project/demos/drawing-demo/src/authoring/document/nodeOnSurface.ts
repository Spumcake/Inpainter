import { capabilitiesFor } from '../nodes/nodeCapabilities';
import type { DocumentState, ViewFocus } from '../types';
import type { Node } from '../types/nodes';

function isGraphFocus(focus: ViewFocus): boolean {
  return focus.canvasId == null && focus.graphId != null;
}

/**
 * Whether `node` belongs on the focused Graph / Canvas surface.
 * Single source of truth for resume filtering, metadata pill, and Output chrome.
 *
 * Graph-placed Images and GraphText are document-global (not graph-scoped) —
 * same as {@link imagesForGraph} / {@link graphTextNodes}.
 * Frames on Graph are scoped via `canvasOrderByGraph`, matching {@link framesForGraph}.
 */
export function nodeOnSurface(
  node: Node,
  focus: ViewFocus,
  document: DocumentState,
): boolean {
  const caps = capabilitiesFor(node.type);

  if (isGraphFocus(focus)) {
    if (!caps.surfaces.includes('graph')) {
      return false;
    }
    if (node.type === 'frame') {
      const canvasIds = document.canvasOrderByGraph[focus.graphId!] ?? [];
      return canvasIds.includes(node.canvasId);
    }
    if (node.type === 'image') {
      return node.placement.kind === 'graph';
    }
    if (node.type === 'graphText') {
      return true;
    }
    return false;
  }

  const canvasId = focus.canvasId;
  if (canvasId == null) {
    return false;
  }
  if (!caps.surfaces.includes('canvas')) {
    return false;
  }

  if (node.type === 'image') {
    return (
      node.placement.kind === 'canvas' && node.placement.canvasId === canvasId
    );
  }

  const nodeCanvasId = caps.canvasIdOf(node);
  return nodeCanvasId === canvasId;
}
