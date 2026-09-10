import type { Draft } from 'immer';
import { current, isDraft } from 'immer';
import type { DocumentStore } from '../document/documentStore';
import type { SessionStore } from '../session/sessionStore';
import type { DocumentState, Node, Point2D } from '../types';
import type { CanvasId, NodeId } from '../ids';
import {
  asNodeId,
  asStrokeId,
  asSublayerId,
  createId,
} from '../ids';
import type { Command } from '../commands/types';
import {
  cloneNodeWithOffset,
  DEFAULT_DUPLICATE_OFFSET,
  createNode,
} from './commands';
import type { AuthoringSurface } from './nodeCapabilities';

export type ClipboardPayload = {
  nodes: Node[];
  sourceSurface: AuthoringSurface;
};

export type PasteNodesOptions = {
  /**
   * World-space top-left for the pasted selection AABB.
   * When omitted, uses {@link DEFAULT_DUPLICATE_OFFSET} from the originals.
   */
  at?: Point2D;
  /** Focused Canvas — remaps canvas-bound Nodes onto this Canvas. */
  targetCanvasId?: CanvasId;
  /** Surface being pasted onto (selects which geometry anchors `at`). */
  surface: AuthoringSurface;
};

/** structuredClone cannot clone Immer drafts — peel with current() first. */
function clonePlain<T>(value: T): T {
  return structuredClone(isDraft(value) ? current(value) : value);
}

export function isClipboardPayload(value: unknown): value is ClipboardPayload {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('nodes' in value) ||
    !Array.isArray((value as ClipboardPayload).nodes)
  ) {
    return false;
  }
  const surface = (value as ClipboardPayload).sourceSurface;
  return surface === 'graph' || surface === 'canvas';
}

export function copyNodes(
  sessionStore: SessionStore,
  documentStore: DocumentStore,
  ids: NodeId[],
  sourceSurface: AuthoringSurface,
): ClipboardPayload {
  const state = documentStore.getState();
  const nodes: Node[] = [];

  for (const id of ids) {
    const node = state.nodes[id];
    if (node) {
      nodes.push(clonePlain(node));
    }
  }

  const payload: ClipboardPayload = { nodes, sourceSurface };
  sessionStore.setState((session) => {
    session.clipboard = payload;
  });

  return payload;
}

/** Top-left used to anchor paste on the given surface. */
export function nodePasteOrigin(
  node: Node,
  surface: AuthoringSurface,
): Point2D | null {
  if (surface === 'graph') {
    if (node.type === 'frame') {
      return { x: node.graph.x, y: node.graph.y };
    }
    if (node.type === 'graphText') {
      return { x: node.graph.x, y: node.graph.y };
    }
    if (node.type === 'image' && node.placement.kind === 'graph') {
      return { x: node.placement.graph.x, y: node.placement.graph.y };
    }
    return null;
  }

  if (node.type === 'sketch') {
    return { x: node.canvas.x, y: node.canvas.y };
  }
  if (node.type === 'container') {
    return { x: node.canvas.x, y: node.canvas.y };
  }
  if (node.type === 'canvasText') {
    return { x: node.canvas.x, y: node.canvas.y };
  }
  if (node.type === 'image' && node.placement.kind === 'canvas') {
    return { x: node.placement.canvas.x, y: node.placement.canvas.y };
  }
  if (node.type === 'frame') {
    return { x: node.crop.x, y: node.crop.y };
  }
  return null;
}

export function pasteOffsetForNodes(
  nodes: readonly Node[],
  surface: AuthoringSurface,
  at: Point2D | undefined,
): Point2D {
  if (!at) {
    return { ...DEFAULT_DUPLICATE_OFFSET };
  }
  let minX = Infinity;
  let minY = Infinity;
  for (const node of nodes) {
    const origin = nodePasteOrigin(node, surface);
    if (!origin) continue;
    minX = Math.min(minX, origin.x);
    minY = Math.min(minY, origin.y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { ...DEFAULT_DUPLICATE_OFFSET };
  }
  return { x: at.x - minX, y: at.y - minY };
}

/** Remap canvas membership for Nodes that live on a Canvas. */
export function rebindNodeToCanvas(node: Node, canvasId: CanvasId): void {
  if (node.type === 'sketch' || node.type === 'canvasText') {
    node.canvasId = canvasId;
    return;
  }
  if (node.type === 'container') {
    node.canvasId = canvasId;
    return;
  }
  if (node.type === 'image' && node.placement.kind === 'canvas') {
    node.placement = {
      kind: 'canvas',
      canvasId,
      canvas: node.placement.canvas,
    };
  }
}

function copySketchInk(
  draft: Draft<DocumentState>,
  sourceCanvasId: CanvasId,
  sourceSketchId: NodeId,
  targetCanvasId: CanvasId,
  targetSketchId: NodeId,
  offset: Point2D,
): void {
  const source = draft.sketches[sourceCanvasId];
  const target = draft.sketches[targetCanvasId];
  if (!source || !target || target.layers.length === 0) {
    return;
  }
  const targetLayer = target.layers[0]!;

  for (const layer of source.layers) {
    for (const sublayer of layer.sublayers) {
      const matchingPaths = sublayer.paths.filter(
        (path) => path.sketchId === sourceSketchId,
      );
      if (matchingPaths.length === 0) continue;

      let dest = targetLayer.sublayers.find(
        (candidate) =>
          (candidate.paletteId ?? null) === (sublayer.paletteId ?? null),
      );
      if (!dest) {
        dest = {
          id: asSublayerId(createId('sublayer')),
          visible: true,
          locked: false,
          paletteId: sublayer.paletteId,
          paths: [],
          objects: [],
        };
        targetLayer.sublayers.push(dest);
      }

      for (const path of matchingPaths) {
        dest.paths.push({
          id: asStrokeId(createId('stroke')),
          sketchId: targetSketchId,
          attrs: path.attrs ? clonePlain(path.attrs) : undefined,
          points: path.points.map((point) => ({
            x: point.x + offset.x,
            y: point.y + offset.y,
            pressure: point.pressure,
          })),
        });
      }
    }
  }
}

export function pasteNodesCommand(
  clipboard: unknown,
  options: PasteNodesOptions,
): Command {
  if (!isClipboardPayload(clipboard) || clipboard.nodes.length === 0) {
    return {
      label: 'Paste nodes',
      apply: () => {},
    };
  }

  const nodes = clipboard.nodes.map((node) => clonePlain(node));
  const offset = pasteOffsetForNodes(nodes, options.surface, options.at);
  const targetCanvasId = options.targetCanvasId;

  return {
    label: nodes.length === 1 ? 'Paste node' : 'Paste nodes',
    apply: (draft) => {
      const idMap = new Map<NodeId, NodeId>();
      for (const original of nodes) {
        idMap.set(original.id, asNodeId(createId('node')));
      }

      for (const original of nodes) {
        const newId = idMap.get(original.id)!;
        const clone = cloneNodeWithOffset(original, newId, offset);
        if (targetCanvasId != null) {
          rebindNodeToCanvas(clone, targetCanvasId);
        }
        if (clone.type === 'container') {
          clone.memberIds = clone.memberIds
            .map((memberId) => idMap.get(memberId))
            .filter((memberId): memberId is NodeId => memberId != null);
        }
        createNode(clone).apply(draft);

        if (original.type === 'sketch' && clone.type === 'sketch') {
          const fromCanvasId = original.canvasId;
          const toCanvasId = clone.canvasId;
          copySketchInk(
            draft,
            fromCanvasId,
            original.id,
            toCanvasId,
            clone.id,
            offset,
          );
        }
      }
    },
  };
}
