import type { CanvasId } from '../ids';
import type { DocumentState, Node, SketchNode } from '../types';

function isSketchNode(node: Node): node is SketchNode {
  return node.type === 'sketch';
}

/** Returns Sketch Nodes for a Canvas, sorted by stackOrder then id. */
export function listSketchesForCanvas(
  state: Pick<DocumentState, 'nodes'>,
  canvasId: CanvasId,
): SketchNode[] {
  return Object.values(state.nodes)
    .filter(isSketchNode)
    .filter((node) => node.canvasId === canvasId)
    .sort((a, b) => {
      if (a.stackOrder !== b.stackOrder) {
        return a.stackOrder - b.stackOrder;
      }
      return a.id.localeCompare(b.id);
    });
}
