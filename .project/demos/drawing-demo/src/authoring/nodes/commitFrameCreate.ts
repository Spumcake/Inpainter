import type { AuthoringWorkspace } from '../workspace/types';
import type { GraphId, NodeId } from '../ids';
import { DEFAULT_SKETCH_ARTBOARD_SIZE } from '../document/factory';
import { createCanvasOnGraph } from '../sketch/commands';
import { setActiveTool, setSelection } from '../session/sessionStore';
import type { NodeRef, Rect } from '../types';
import { resolveFramePreferences } from '../../settings/resolveFramePreferences';
import { createNode } from './commands';
import { buildFrame } from './factories';
import {
  listGraphSurfaceStack,
  nextSurfaceStackOrder,
} from './surfaceStack';
import { nextUntitledFrameName } from './untitledFrameName';

const MIN_MEANINGFUL_SIZE = 4;

export type CommitCreatedFrameArgs = {
  /**
   * Drag rect on the Graph board (same meaning as createSketch).
   * Position → `frame.graph`; size → `frame.crop` width/height.
   * Crop is centered on the new Canvas artboard.
   * Tiny sizes snap to Document Preferences Frame defaults.
   */
  graphRect: Rect;
};

/** Crop size from Graph drag, centered on the Canvas artboard. */
export function centeredCropOnArtboard(
  size: { width: number; height: number },
  artboard: { width: number; height: number },
): Rect {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  return {
    x: (artboard.width - width) / 2,
    y: (artboard.height - height) / 2,
    width,
    height,
  };
}

function resolveCreateSize(graphRect: Rect): { width: number; height: number } {
  if (
    graphRect.width >= MIN_MEANINGFUL_SIZE &&
    graphRect.height >= MIN_MEANINGFUL_SIZE
  ) {
    return { width: graphRect.width, height: graphRect.height };
  }
  const prefs = resolveFramePreferences();
  return { width: prefs.defaultWidth, height: prefs.defaultHeight };
}

/**
 * Always allocates a new Canvas under the Graph, creates a Frame on it,
 * selects the Frame, and latches Select.
 */
export function commitCreatedFrame(
  workspace: AuthoringWorkspace,
  graphId: GraphId,
  args: CommitCreatedFrameArgs,
): NodeId | null {
  const before = workspace.documentStore.getState();
  if (!before.graphs[graphId]) {
    return null;
  }

  workspace.runner.dispatch(createCanvasOnGraph(graphId));

  const afterCanvas = workspace.documentStore.getState();
  const order = afterCanvas.canvasOrderByGraph[graphId] ?? [];
  const canvasId = order[order.length - 1];
  if (!canvasId) {
    return null;
  }

  const { x, y } = args.graphRect;
  const size = resolveCreateSize(args.graphRect);
  const prefs = resolveFramePreferences();
  const sketch = afterCanvas.sketches[canvasId];
  const artboard = {
    width: sketch?.width ?? DEFAULT_SKETCH_ARTBOARD_SIZE,
    height: sketch?.height ?? DEFAULT_SKETCH_ARTBOARD_SIZE,
  };
  const node = buildFrame({
    canvasId,
    graph: { x, y },
    crop: centeredCropOnArtboard(size, artboard),
    // Output resolution from Document Preferences — not crop/card size.
    resolutionWidth: prefs.defaultWidth,
    resolutionHeight: prefs.defaultHeight,
    name: nextUntitledFrameName(afterCanvas, graphId),
    stackOrder: nextSurfaceStackOrder(
      listGraphSurfaceStack(afterCanvas, graphId),
    ),
  });
  workspace.runner.dispatch(createNode(node));
  setSelection(
    workspace.sessionStore,
    new Set<NodeRef>([{ type: 'frame', id: node.id }]),
  );
  setActiveTool(workspace.sessionStore, 'select');
  return node.id;
}
