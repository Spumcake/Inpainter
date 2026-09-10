import { canvasSelectEntries } from './container';
import {
  listGraphSurfaceStack,
} from './surfaceStack';
import type { DocumentState } from '../types/document';
import type { SessionState } from '../types/session';
import type {
  FrameNode,
  ImageNode,
  Node,
  ContainerNode,
  SketchNode,
} from '../types/nodes';
import { hasSelectableSketchBounds } from './factories';
import { comparePeerStackOrder } from './peerStack';

export type SelectTargetPeerGroup = 'sketch' | 'container' | 'image' | 'frame';

export type SelectTargetRow = {
  node: SketchNode | ContainerNode | ImageNode | FrameNode;
  peerGroup: SelectTargetPeerGroup;
  /** Index within ascending unified surface stack (0 = bottom). */
  peerIndex: number;
};

function peerGroupForNode(
  node: SketchNode | ContainerNode | ImageNode | FrameNode,
): SelectTargetPeerGroup {
  if (node.type === 'sketch') return 'sketch';
  if (node.type === 'container') return 'container';
  if (node.type === 'frame') return 'frame';
  return 'image';
}

/**
 * Nodes the Select tool can click on the focused Graph or Canvas.
 * Hidden Nodes stay listed (eye off). Empty-bounds Sketches are excluded.
 * Order: unified surface stack, front-first (descending stackOrder).
 */
export function selectTargetsForFocusedSurface(
  documentState: DocumentState,
  sessionState: SessionState,
): SelectTargetRow[] {
  const { graphId, canvasId } = sessionState.viewFocus;

  if (canvasId) {
    const ascending = canvasSelectEntries(
      documentState,
      canvasId,
      sessionState.containerEditId ?? null,
    )
      .map((entry) => entry.node)
      .filter(
        (node) =>
          node.type !== 'sketch' || hasSelectableSketchBounds(node.canvas),
      )
      .sort(comparePeerStackOrder);
    return rowsForSurfaceStack(ascending);
  }

  if (graphId) {
    const ascending = listGraphSurfaceStack(documentState, graphId);
    return rowsForSurfaceStack(ascending);
  }

  return [];
}

function rowsForSurfaceStack(
  ascending: readonly (SketchNode | ContainerNode | ImageNode | FrameNode)[],
): SelectTargetRow[] {
  // Outliner shows front-first; ascending is bottom→top.
  return ascending
    .map((node, peerIndex) => ({
      node,
      peerGroup: peerGroupForNode(node),
      peerIndex,
    }))
    .reverse();
}

/** Resolve display name for an Outliner row. */
export function selectTargetLabel(node: Node): string {
  if (
    node.type === 'sketch' ||
    node.type === 'container' ||
    node.type === 'frame' ||
    node.type === 'image'
  ) {
    return node.name;
  }
  return node.type;
}
