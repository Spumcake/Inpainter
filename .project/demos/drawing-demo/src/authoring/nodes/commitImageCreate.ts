import type { AuthoringWorkspace } from '../workspace/types';
import type { GraphId, NodeId } from '../ids';
import { setActiveTool, setSelection } from '../session/sessionStore';
import type { ImagePlacement, NodeRef } from '../types';
import { createNode } from './commands';
import { buildImage } from './factories';
import {
  listCanvasSurfaceStack,
  listGraphSurfaceStack,
  nextSurfaceStackOrder,
} from './surfaceStack';
import {
  nextUntitledImageNameForCanvas,
  nextUntitledImageNameForGraph,
} from './untitledImageName';

export type CommitCreatedImageArgs = {
  mediaId: string;
  placement: ImagePlacement;
  name?: string;
};

/**
 * Creates an Image Node, selects it, and latches Select.
 * Bytes must already be stored via Document media (`mediaId`).
 */
export function commitCreatedImage(
  workspace: AuthoringWorkspace,
  args: CommitCreatedImageArgs,
): NodeId | null {
  if (!args.mediaId.trim()) {
    return null;
  }

  const state = workspace.documentStore.getState();
  let name = args.name?.trim();
  if (!name) {
    name =
      args.placement.kind === 'graph'
        ? nextUntitledImageNameForGraph(state)
        : nextUntitledImageNameForCanvas(state, args.placement.canvasId);
  }

  let stackOrder = 0;
  if (args.placement.kind === 'graph') {
    const graphId =
      workspace.sessionStore.getState().viewFocus.graphId ??
      (Object.keys(state.graphs)[0] as GraphId | undefined);
    if (graphId) {
      stackOrder = nextSurfaceStackOrder(
        listGraphSurfaceStack(state, graphId),
      );
    }
  } else {
    stackOrder = nextSurfaceStackOrder(
      listCanvasSurfaceStack(state, args.placement.canvasId),
    );
  }

  const node = buildImage({
    mediaId: args.mediaId,
    placement: args.placement,
    name,
    stackOrder,
  });
  workspace.runner.dispatch(createNode(node));
  setSelection(
    workspace.sessionStore,
    new Set<NodeRef>([{ type: 'image', id: node.id }]),
  );
  setActiveTool(workspace.sessionStore, 'select');
  return node.id;
}
