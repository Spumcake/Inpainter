import type { NodeId } from '../ids';
import type { Command } from '../commands/types';
import type { DocumentState } from '../types';
import type { FrameNode, ImageNode, Node, Rect } from '../types/nodes';
import { buildImage } from './factories';
import { buildOutputForOwner } from './allocateOutput';
import {
  listCanvasSurfaceStack,
  nextSurfaceStackOrder,
} from './surfaceStack';
import { findOutputForOwner, isOutputOwnerNode } from './outputGeometry';
import { nextRenderResultImageName } from './renderResultImageName';
import type { FrameResultView } from './frameResultView';

function isFrame(node: Node | undefined): node is FrameNode {
  return node?.type === 'frame';
}

function isImage(node: Node | undefined): node is ImageNode {
  return node?.type === 'image';
}

function insertOwnerWithOutput(
  draft: { nodes: Record<NodeId, Node> },
  owner: Node,
): void {
  draft.nodes[owner.id] = owner;
  if (!isOutputOwnerNode(owner)) {
    return;
  }
  if (findOutputForOwner(draft as never, owner.id)) {
    return;
  }
  const output = buildOutputForOwner(owner.id);
  draft.nodes[output.id] = output;
}

/**
 * All Image Node ids that are Frame generation results (`resultImageId`).
 */
export function frameResultImageIds(
  state: Pick<DocumentState, 'nodes'>,
): Set<NodeId> {
  const ids = new Set<NodeId>();
  for (const node of Object.values(state.nodes)) {
    if (isFrame(node) && node.resultImageId) {
      ids.add(node.resultImageId);
    }
  }
  return ids;
}

export function setFrameResultImageId(
  nodeId: NodeId,
  resultImageId: NodeId | undefined,
): Command {
  return {
    label: 'Set frame result image',
    apply: (draft) => {
      const node = draft.nodes[nodeId];
      if (!isFrame(node)) {
        return;
      }
      if (resultImageId === undefined) {
        delete node.resultImageId;
      } else {
        node.resultImageId = resultImageId;
      }
    },
  };
}

export type LandFrameResultImageArgs = {
  frameId: NodeId;
  mediaId: string;
  canvasRect: Rect;
  /** Override display name; default is `Render Result` / `Render Result 2`… */
  name?: string;
};

/**
 * Replace prior Frame result Image (if any), create a new Canvas Image, set `resultImageId`.
 * Does not change Session selection or active tool.
 */
export function landFrameResultImage(args: LandFrameResultImageArgs): Command {
  return {
    label: 'Land frame result',
    apply: (draft) => {
      const frame = draft.nodes[args.frameId];
      if (!isFrame(frame)) {
        return;
      }

      const prevId = frame.resultImageId;
      if (prevId) {
        const prev = draft.nodes[prevId];
        if (isImage(prev)) {
          const output = findOutputForOwner(draft as never, prevId);
          if (output) {
            delete draft.nodes[output.id];
          }
          delete draft.nodes[prevId];
        }
        for (const node of Object.values(draft.nodes)) {
          if (isFrame(node) && node.resultImageId === prevId) {
            delete node.resultImageId;
          }
        }
      }

      const peers = listCanvasSurfaceStack(draft as never, frame.canvasId);
      const name =
        args.name?.trim() ||
        nextRenderResultImageName(draft as never, frame.canvasId);
      const image = buildImage({
        mediaId: args.mediaId,
        placement: {
          kind: 'canvas',
          canvasId: frame.canvasId,
          canvas: { ...args.canvasRect },
        },
        name,
        stackOrder: nextSurfaceStackOrder(peers),
      });

      insertOwnerWithOutput(draft, image);

      const nextFrame = draft.nodes[args.frameId];
      if (isFrame(nextFrame)) {
        nextFrame.resultImageId = image.id;
        nextFrame.resultView = 'output' satisfies FrameResultView;
        delete nextFrame.frameWindowUrl;
      }
    },
  };
}
