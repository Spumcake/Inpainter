import type { NodeId } from '../ids';
import type { Command } from '../commands/types';
import type { DocumentState } from '../types';
import type { FrameNode, Node } from '../types/nodes';

export type FrameResultView = 'input' | 'output';

function isFrame(node: Node | undefined): node is FrameNode {
  return node?.type === 'frame';
}

export function frameResultView(frame: FrameNode): FrameResultView {
  return frame.resultView === 'output' ? 'output' : 'input';
}

export function setFrameResultView(
  nodeId: NodeId,
  view: FrameResultView,
): Command {
  return {
    label: view === 'output' ? 'Show frame output' : 'Show frame input',
    apply: (draft) => {
      const node = draft.nodes[nodeId];
      if (!isFrame(node)) {
        return;
      }
      if (view === 'input') {
        delete node.resultView;
      } else {
        node.resultView = 'output';
      }
    },
  };
}

export function toggleFrameResultView(nodeId: NodeId): Command {
  return {
    label: 'Toggle frame output view',
    apply: (draft) => {
      const node = draft.nodes[nodeId];
      if (!isFrame(node)) {
        return;
      }
      if (frameResultView(node) === 'output') {
        delete node.resultView;
      } else {
        node.resultView = 'output';
      }
    },
  };
}

/** Frame that owns this Image as `resultImageId`, if any. */
export function frameOwningResultImage(
  state: Pick<DocumentState, 'nodes'>,
  imageId: NodeId,
): FrameNode | null {
  for (const node of Object.values(state.nodes)) {
    if (isFrame(node) && node.resultImageId === imageId) {
      return node;
    }
  }
  return null;
}

export type OutputInputToggleTarget = {
  frameId: NodeId;
  resultView: FrameResultView;
  /** True when the Frame has a landable/landed result to show. */
  hasResult: boolean;
};

/**
 * Sole selection Frame, sole selection result Image’s Frame, or Edit `canvasFrameId`.
 */
export function resolveOutputInputToggleTarget(args: {
  nodes: DocumentState['nodes'];
  selection: ReadonlySet<{ type: string; id: NodeId }>;
  canvasFrameId: NodeId | null;
}): OutputInputToggleTarget | null {
  const selection = Array.from(args.selection);
  if (selection.length === 1) {
    const ref = selection[0]!;
    if (ref.type === 'frame') {
      const frame = args.nodes[ref.id];
      if (isFrame(frame)) {
        return {
          frameId: frame.id,
          resultView: frameResultView(frame),
          hasResult: Boolean(frame.resultImageId || frame.frameWindowUrl),
        };
      }
    }
    if (ref.type === 'image') {
      const owner = frameOwningResultImage({ nodes: args.nodes }, ref.id);
      if (owner) {
        return {
          frameId: owner.id,
          resultView: frameResultView(owner),
          hasResult: true,
        };
      }
    }
  }

  if (args.canvasFrameId) {
    const frame = args.nodes[args.canvasFrameId];
    if (isFrame(frame)) {
      return {
        frameId: frame.id,
        resultView: frameResultView(frame),
        hasResult: Boolean(frame.resultImageId || frame.frameWindowUrl),
      };
    }
  }

  return null;
}
