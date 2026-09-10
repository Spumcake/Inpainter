import {
  asCanvasId,
  asGraphId,
  createId,
  type CanvasId,
  type GraphId,
  type NodeId,
} from '../ids';
import { createDefaultSketchData } from './factory';
import type { Command } from '../commands/types';
import type { DocumentState, Node } from '../types';

function isFrameNode(node: Node): node is Node & { canvasId: CanvasId } {
  return node.type === 'frame';
}

function isCanvasTextNode(node: Node): node is Node & { canvasId: CanvasId } {
  return node.type === 'canvasText';
}

function isSketchNode(node: Node): node is Node & { canvasId: CanvasId } {
  return node.type === 'sketch';
}

function removeNodesForCanvas(draft: DocumentState, canvasId: CanvasId): void {
  for (const [nodeId, node] of Object.entries(draft.nodes) as [NodeId, Node][]) {
    if (
      (isFrameNode(node) || isCanvasTextNode(node) || isSketchNode(node)) &&
      node.canvasId === canvasId
    ) {
      delete draft.nodes[nodeId];
    }
  }
}

function removeCanvasFromDocument(
  draft: DocumentState,
  canvasId: CanvasId,
  graphId: GraphId,
): void {
  removeNodesForCanvas(draft, canvasId);
  delete draft.sketches[canvasId];
  delete draft.canvases[canvasId];

  const order = draft.canvasOrderByGraph[graphId];
  if (order) {
    draft.canvasOrderByGraph[graphId] = order.filter((id) => id !== canvasId);
  }
}

export function createGraph(name?: string): Command {
  return {
    label: 'Create graph',
    apply: (draft) => {
      const graphId = asGraphId(createId('graph'));
      draft.graphs[graphId] = { id: graphId, name };
      draft.graphOrder.push(graphId);

      const canvasId = asCanvasId(createId('canvas'));
      draft.canvases[canvasId] = {
        id: canvasId,
        graphId,
        artifactIds: [],
      };
      draft.canvasOrderByGraph[graphId] = [canvasId];
      draft.sketches[canvasId] = createDefaultSketchData(canvasId);
    },
  };
}

export function deleteGraph(graphId: GraphId): Command {
  return {
    label: 'Delete graph',
    apply: (draft) => {
      if (draft.graphOrder.length <= 1 || !draft.graphs[graphId]) {
        return;
      }

      const canvasIds = draft.canvasOrderByGraph[graphId] ?? [];
      for (const canvasId of canvasIds) {
        removeNodesForCanvas(draft, canvasId);
        delete draft.sketches[canvasId];
        delete draft.canvases[canvasId];
      }

      delete draft.canvasOrderByGraph[graphId];
      delete draft.graphs[graphId];
      draft.graphOrder = draft.graphOrder.filter((id) => id !== graphId);
    },
  };
}

export function deleteCanvas(canvasId: CanvasId): Command {
  return {
    label: 'Delete canvas',
    apply: (draft) => {
      const canvas = draft.canvases[canvasId];
      if (!canvas) {
        return;
      }

      const graphId = canvas.graphId;
      const order = draft.canvasOrderByGraph[graphId] ?? [];
      if (order.length <= 1) {
        return;
      }

      removeCanvasFromDocument(draft, canvasId, graphId);
    },
  };
}

export function renameDocument(title: string): Command {
  const trimmed = title.trim();
  return {
    label: 'Rename document',
    apply: (draft) => {
      if (!trimmed) {
        return;
      }
      draft.title = trimmed;
    },
  };
}

export function renameGraph(graphId: GraphId, name: string): Command {
  const trimmed = name.trim();
  return {
    label: 'Rename graph',
    apply: (draft) => {
      const graph = draft.graphs[graphId];
      if (!graph || !trimmed) {
        return;
      }
      graph.name = trimmed;
    },
  };
}

export function canDeleteGraph(state: DocumentState, graphId: GraphId): boolean {
  return state.graphOrder.length > 1 && Boolean(state.graphs[graphId]);
}

export function canDeleteCanvas(
  state: DocumentState,
  canvasId: CanvasId,
): boolean {
  const canvas = state.canvases[canvasId];
  if (!canvas) {
    return false;
  }

  return (state.canvasOrderByGraph[canvas.graphId]?.length ?? 0) > 1;
}
