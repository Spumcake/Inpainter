import type { CanvasId, GraphId } from '../ids';
import type {
  CanvasTextNode,
  DocumentState,
  FrameNode,
  GraphTextNode,
  ImageNode,
  Node,
  Rect,
  SketchNode,
} from '../types';

function isFrameNode(node: Node): node is FrameNode {
  return node.type === 'frame';
}

function isGraphTextNode(node: Node): node is GraphTextNode {
  return node.type === 'graphText';
}

function isCanvasTextNode(node: Node): node is CanvasTextNode {
  return node.type === 'canvasText';
}

function isSketchNode(node: Node): node is SketchNode {
  return node.type === 'sketch';
}

function isImageNode(node: Node): node is ImageNode {
  return node.type === 'image';
}

export function framesForCanvas(
  state: DocumentState,
  canvasId: CanvasId,
): FrameNode[] {
  return Object.values(state.nodes)
    .filter(isFrameNode)
    .filter((node) => node.canvasId === canvasId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Frames whose Canvas belongs to the given Graph (card membership). */
export function framesForGraph(
  state: DocumentState,
  graphId: GraphId,
): FrameNode[] {
  const canvasIds = new Set(state.canvasOrderByGraph[graphId] ?? []);
  return Object.values(state.nodes)
    .filter(isFrameNode)
    .filter((node) => canvasIds.has(node.canvasId))
    .sort((a, b) => {
      if (a.stackOrder !== b.stackOrder) {
        return a.stackOrder - b.stackOrder;
      }
      return a.id.localeCompare(b.id);
    });
}

export function frameCardAspect(frame: FrameNode): number {
  const { width, height } = frame.crop;
  if (height <= 0) {
    return 1;
  }
  return width / height;
}

/**
 * Axis-aligned Graph Frame rect: crop width/height placed at `frame.graph`.
 * One size fact (crop); Graph stores position only.
 */
export function frameCardRect(frame: FrameNode): Rect {
  return {
    x: frame.graph.x,
    y: frame.graph.y,
    width: Math.max(1, frame.crop.width),
    height: Math.max(1, frame.crop.height),
  };
}

export function graphTextNodes(state: DocumentState): GraphTextNode[] {
  return Object.values(state.nodes)
    .filter(isGraphTextNode)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function canvasTextForCanvas(
  state: DocumentState,
  canvasId: CanvasId,
): CanvasTextNode[] {
  return Object.values(state.nodes)
    .filter(isCanvasTextNode)
    .filter((node) => node.canvasId === canvasId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function sketchesForCanvas(
  state: DocumentState,
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

/** Graph-placed Image Nodes (placement.kind === 'graph'). */
export function imagesForGraph(state: DocumentState): ImageNode[] {
  return Object.values(state.nodes)
    .filter(isImageNode)
    .filter((node) => node.placement.kind === 'graph')
    .sort((a, b) => {
      if (a.stackOrder !== b.stackOrder) {
        return a.stackOrder - b.stackOrder;
      }
      return a.id.localeCompare(b.id);
    });
}

/** Canvas-placed Image Nodes for a Canvas. */
export function imagesForCanvas(
  state: DocumentState,
  canvasId: CanvasId,
): ImageNode[] {
  return Object.values(state.nodes)
    .filter(isImageNode)
    .filter(
      (node) =>
        node.placement.kind === 'canvas' &&
        node.placement.canvasId === canvasId,
    )
    .sort((a, b) => {
      if (a.stackOrder !== b.stackOrder) {
        return a.stackOrder - b.stackOrder;
      }
      return a.id.localeCompare(b.id);
    });
}

/** Durable axis-aligned rect for an Image Node. */
export function imageRect(node: ImageNode): Rect {
  return node.placement.kind === 'graph'
    ? { ...node.placement.graph }
    : { ...node.placement.canvas };
}

export function firstGraphId(state: DocumentState): GraphId | undefined {
  return state.graphOrder[0];
}

export function firstCanvasIdForGraph(
  state: DocumentState,
  graphId: GraphId,
): CanvasId | undefined {
  return state.canvasOrderByGraph[graphId]?.[0];
}

export function sketchHasPaletteCatalogKeys(sketch: DocumentState['sketches'][CanvasId]): boolean {
  const forbidden = ['toolPalettes', 'toolPresets', 'activePaletteId'] as const;
  return forbidden.some((key) => key in sketch);
}
