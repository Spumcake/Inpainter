import type { CanvasId, GraphId, NodeId } from '../ids';
import type {
  DocumentState,
  FrameNode,
  ImageNode,
  Node,
  SketchNode,
} from '../types';
import {
  framesForGraph,
  imagesForCanvas,
  imagesForGraph,
} from '../document/selectors';
import { listSketchesForCanvas } from './listSketches';
import {
  comparePeerStackOrder,
  computePeerStackOrdersToIndex,
  nextPeerStackOrder,
  type PeerStackItem,
  type PeerStackOrders,
} from './peerStack';
import type { SketchStackAction } from './sketchStack';

/** Stackable Canvas Nodes (v1). */
export type CanvasSurfaceStackNode = SketchNode | ImageNode;

/** Stackable Graph Nodes (v1). */
export type GraphSurfaceStackNode = FrameNode | ImageNode;

export type SurfaceStackNode = CanvasSurfaceStackNode | GraphSurfaceStackNode;

/** Canvas surface stack: Sketch + canvas Image, ascending stackOrder. */
export function listCanvasSurfaceStack(
  state: Pick<DocumentState, 'nodes'>,
  canvasId: CanvasId,
): CanvasSurfaceStackNode[] {
  const sketches = listSketchesForCanvas(state, canvasId);
  const images = imagesForCanvas(state as DocumentState, canvasId);
  return [...sketches, ...images].sort(comparePeerStackOrder);
}

/**
 * Graph surface stack: Frames on `graphId` + all graph-placed Images,
 * ascending stackOrder (matches prior Graph Outliner membership).
 */
export function listGraphSurfaceStack(
  state: DocumentState,
  graphId: GraphId,
): GraphSurfaceStackNode[] {
  const frames = framesForGraph(state, graphId);
  const images = imagesForGraph(state);
  return [...frames, ...images].sort(comparePeerStackOrder);
}

export function nextSurfaceStackOrder(
  ordered: readonly PeerStackItem[],
): number {
  return nextPeerStackOrder(ordered);
}

export function computeSurfaceStackOrdersToIndex(
  ordered: readonly PeerStackItem[],
  id: NodeId,
  toIndex: number,
): PeerStackOrders | null {
  return computePeerStackOrdersToIndex(ordered, id, toIndex);
}

export function computeSurfaceStackOrders(
  ordered: readonly PeerStackItem[],
  id: NodeId,
  action: SketchStackAction,
): PeerStackOrders | null {
  const fromIndex = ordered.findIndex((item) => item.id === id);
  if (fromIndex < 0) {
    return null;
  }
  const last = ordered.length - 1;
  let toIndex = fromIndex;
  switch (action) {
    case 'front':
      toIndex = last;
      break;
    case 'forward':
      toIndex = Math.min(last, fromIndex + 1);
      break;
    case 'backward':
      toIndex = Math.max(0, fromIndex - 1);
      break;
    case 'back':
      toIndex = 0;
      break;
  }
  return computePeerStackOrdersToIndex(ordered, id, toIndex);
}

export function canReorderSurfaceStack(
  ordered: readonly PeerStackItem[],
  id: NodeId,
  action: SketchStackAction,
): boolean {
  return computeSurfaceStackOrders(ordered, id, action) != null;
}

export function surfaceStackActionLabel(action: SketchStackAction): string {
  switch (action) {
    case 'front':
      return 'Bring to front';
    case 'forward':
      return 'Bring forward';
    case 'backward':
      return 'Send backward';
    case 'back':
      return 'Send to back';
  }
}

/**
 * Resolve the unified surface list for a stackable Node.
 * Graph Images need `graphId` (focused Graph) — same membership as Frames.
 */
export function resolveSurfaceStackForNode(
  state: DocumentState,
  nodeId: NodeId,
  graphId?: GraphId | null,
): { ordered: SurfaceStackNode[]; node: SurfaceStackNode } | null {
  const node = state.nodes[nodeId];
  if (!node) return null;

  if (node.type === 'sketch') {
    return {
      ordered: listCanvasSurfaceStack(state, node.canvasId),
      node,
    };
  }

  if (node.type === 'image') {
    if (node.placement.kind === 'canvas') {
      return {
        ordered: listCanvasSurfaceStack(state, node.placement.canvasId),
        node,
      };
    }
    const resolvedGraphId =
      graphId ?? (Object.keys(state.graphs)[0] as GraphId | undefined);
    if (!resolvedGraphId) {
      return {
        ordered: imagesForGraph(state).sort(comparePeerStackOrder),
        node,
      };
    }
    return {
      ordered: listGraphSurfaceStack(state, resolvedGraphId),
      node,
    };
  }

  if (node.type === 'frame') {
    const canvas = state.canvases[node.canvasId];
    if (!canvas) return null;
    return {
      ordered: listGraphSurfaceStack(state, canvas.graphId),
      node,
    };
  }

  return null;
}

export function applySurfaceStackOrders(
  nodes: DocumentState['nodes'],
  orders: PeerStackOrders,
): void {
  for (const [id, stackOrder] of orders) {
    const node = nodes[id];
    if (
      node &&
      (node.type === 'sketch' ||
        node.type === 'image' ||
        node.type === 'frame')
    ) {
      node.stackOrder = stackOrder;
    }
  }
}

export function isCanvasSurfaceStackNode(
  node: Node,
): node is CanvasSurfaceStackNode {
  if (node.type === 'sketch') return true;
  if (node.type === 'image') {
    return node.placement.kind === 'canvas';
  }
  return false;
}

export function isGraphSurfaceStackNode(
  node: Node,
): node is GraphSurfaceStackNode {
  if (node.type === 'frame') return true;
  if (node.type === 'image') {
    return node.placement.kind === 'graph';
  }
  return false;
}
