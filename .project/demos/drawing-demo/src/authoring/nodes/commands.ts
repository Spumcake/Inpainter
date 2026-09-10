import {
  asNodeId,
  createId,
  type GraphId,
  type CanvasId,
  type NodeId,
} from '../ids';
import { current, isDraft } from 'immer';
import type {
  CanvasTextNode,
  FrameNode,
  GraphTextNode,
  ImageNode,
  Node,
  NodeRef,
  OutputNode,
  Point2D,
  Rect,
  ContainerNode,
  SketchNode,
} from '../types';
import type { Command } from '../commands/types';
import {
  buildCanvasText,
  buildFrame,
  buildGraphText,
  buildImage,
  buildSketch,
  buildContainer,
  type BuildCanvasTextArgs,
  type BuildFrameArgs,
  type BuildGraphTextArgs,
  type BuildImageArgs,
  type BuildSketchArgs,
} from './factories';
import { buildOutputForOwner } from './allocateOutput';
import { findOutputForOwner, isOutputOwnerNode } from './outputGeometry';
import {
  applySurfaceStackOrders,
  computeSurfaceStackOrders,
  computeSurfaceStackOrdersToIndex,
  resolveSurfaceStackForNode,
  surfaceStackActionLabel,
} from './surfaceStack';
import {
  sketchStackActionLabel,
  type SketchStackAction,
} from './sketchStack';
import {
  clampRectSize,
  scaleSketchPathsThroughRects,
  sketchInkScale,
  strokeWidthScale,
} from './transformGeometry';
import {
  canGroupSelection,
  containerIdForSketch,
  expandDeleteIds,
  mapMemberRectThroughGroupResize,
  parseGroupSelection,
  recomputeContainerBounds,
  sketchHasInkPaths,
  syncParentContainerBounds,
  unionBoundsForRects,
} from './container';
import { listCanvasSurfaceStack } from './surfaceStack';
import { nextPeerStackOrder } from './peerStack';
import { nextUntitledSketchGroupName } from './untitledSketchGroupName';

export const DEFAULT_DUPLICATE_OFFSET: Point2D = { x: 24, y: 24 };

function getNode(draft: { nodes: Record<NodeId, Node> }, id: NodeId): Node | undefined {
  return draft.nodes[id];
}

function isFrame(node: Node | undefined): node is FrameNode {
  return node?.type === 'frame';
}

function isGraphText(node: Node | undefined): node is GraphTextNode {
  return node?.type === 'graphText';
}

function isCanvasText(node: Node | undefined): node is CanvasTextNode {
  return node?.type === 'canvasText';
}

function isSketch(node: Node | undefined): node is SketchNode {
  return node?.type === 'sketch';
}

function isContainerNode(node: Node | undefined): node is ContainerNode {
  return node?.type === 'container';
}

function isImage(node: Node | undefined): node is ImageNode {
  return node?.type === 'image';
}

function isOutput(node: Node | undefined): node is OutputNode {
  return node?.type === 'output';
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

export function cloneNodeWithOffset(
  node: Node,
  newId: NodeId,
  offset: Point2D,
): Node {
  const plain = isDraft(node) ? (current(node) as Node) : node;
  const clone = structuredClone(plain);
  clone.id = newId;

  if (isFrame(clone)) {
    clone.graph = {
      x: clone.graph.x + offset.x,
      y: clone.graph.y + offset.y,
    };
    clone.crop = {
      ...clone.crop,
      x: clone.crop.x + offset.x,
      y: clone.crop.y + offset.y,
    };
  } else if (isGraphText(clone)) {
    clone.graph = {
      ...clone.graph,
      x: clone.graph.x + offset.x,
      y: clone.graph.y + offset.y,
    };
  } else if (isCanvasText(clone)) {
    clone.canvas = {
      ...clone.canvas,
      x: clone.canvas.x + offset.x,
      y: clone.canvas.y + offset.y,
    };
  } else if (isSketch(clone)) {
    clone.canvas = {
      ...clone.canvas,
      x: clone.canvas.x + offset.x,
      y: clone.canvas.y + offset.y,
    };
  } else if (isContainerNode(clone)) {
    clone.canvas = {
      ...clone.canvas,
      x: clone.canvas.x + offset.x,
      y: clone.canvas.y + offset.y,
    };
  } else if (isImage(clone)) {
    if (clone.placement.kind === 'graph') {
      clone.placement = {
        kind: 'graph',
        graph: {
          ...clone.placement.graph,
          x: clone.placement.graph.x + offset.x,
          y: clone.placement.graph.y + offset.y,
        },
      };
    } else {
      clone.placement = {
        kind: 'canvas',
        canvasId: clone.placement.canvasId,
        canvas: {
          ...clone.placement.canvas,
          x: clone.placement.canvas.x + offset.x,
          y: clone.placement.canvas.y + offset.y,
        },
      };
    }
  }

  return clone;
}

export function createNode(node: Node): Command {
  return {
    label: `Create ${node.type}`,
    apply: (draft) => {
      if (isOutputOwnerNode(node)) {
        insertOwnerWithOutput(draft, node);
        return;
      }
      draft.nodes[node.id] = node;
    },
  };
}

export function createFrame(args: BuildFrameArgs): Command {
  const node = buildFrame(args);
  return {
    label: 'Create frame',
    apply: (draft) => {
      insertOwnerWithOutput(draft, node);
    },
  };
}

export function createGraphText(args: BuildGraphTextArgs = {}): Command {
  const node = buildGraphText(args);
  return {
    label: 'Create graph text',
    apply: (draft) => {
      draft.nodes[node.id] = node;
    },
  };
}

export function createCanvasText(args: BuildCanvasTextArgs): Command {
  const node = buildCanvasText(args);
  return {
    label: 'Create canvas text',
    apply: (draft) => {
      draft.nodes[node.id] = node;
    },
  };
}

export function createSketch(args: BuildSketchArgs): Command {
  const node = buildSketch(args);
  return {
    label: 'Create sketch',
    apply: (draft) => {
      insertOwnerWithOutput(draft, node);
    },
  };
}

export function createImage(args: BuildImageArgs): Command {
  const node = buildImage(args);
  return {
    label: 'Create image',
    apply: (draft) => {
      insertOwnerWithOutput(draft, node);
    },
  };
}

export function deleteNodes(ids: NodeId[]): Command {
  return {
    label: ids.length === 1 ? 'Delete node' : 'Delete nodes',
    apply: (draft) => {
      const expanded = expandDeleteIds(draft as never, ids);
      const idSet = new Set(expanded);
      for (const node of Object.values(draft.nodes)) {
        if (isOutput(node) && idSet.has(node.ownerId)) {
          idSet.add(node.id);
        }
      }
      for (const id of idSet) {
        delete draft.nodes[id];
      }
    },
  };
}

export function duplicateNodes(
  ids: NodeId[],
  offset: Point2D = DEFAULT_DUPLICATE_OFFSET,
): Command {
  return {
    label: ids.length === 1 ? 'Duplicate node' : 'Duplicate nodes',
    apply: (draft) => {
      for (const id of ids) {
        const node = getNode(draft, id);
        if (!node) {
          continue;
        }
        const newId = asNodeId(createId('node'));
        const clone = cloneNodeWithOffset(node, newId, offset);
        if (isOutputOwnerNode(clone)) {
          insertOwnerWithOutput(draft, clone);
        } else {
          draft.nodes[newId] = clone;
        }
      }
    },
  };
}

export function setOutputRelativeScale(
  outputId: NodeId,
  relativeScale: number,
): Command {
  const scale = Math.max(0.01, relativeScale);
  return {
    label: 'Resize output',
    apply: (draft) => {
      const node = getNode(draft, outputId);
      if (isOutput(node)) {
        node.relativeScale = scale;
      }
    },
  };
}

/** Ensure an Output exists for `ownerId` (hydrate missing Outputs). */
export function ensureOutputForOwner(ownerId: NodeId): Command {
  return {
    label: 'Ensure output',
    apply: (draft) => {
      const owner = getNode(draft, ownerId);
      if (!isOutputOwnerNode(owner)) {
        return;
      }
      if (findOutputForOwner(draft as never, owner.id)) {
        return;
      }
      const output = buildOutputForOwner(owner.id);
      draft.nodes[output.id] = output;
    },
  };
}

export function setNodeVisible(nodeId: NodeId, visible: boolean): Command {
  return {
    label: visible ? 'Show node' : 'Hide node',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (node) {
        node.visible = visible;
      }
    },
  };
}

export function setNodeLocked(nodeId: NodeId, locked: boolean): Command {
  return {
    label: locked ? 'Lock node' : 'Unlock node',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (node) {
        node.locked = locked;
      }
    },
  };
}

export function renameSketch(sketchId: NodeId, name: string): Command {
  const trimmed = name.trim();
  return {
    label: 'Rename sketch',
    apply: (draft) => {
      const node = getNode(draft, sketchId);
      if (!isSketch(node) || !trimmed || node.name === trimmed) {
        return;
      }
      node.name = trimmed;
    },
  };
}

export function renameFrame(frameId: NodeId, name: string): Command {
  const trimmed = name.trim();
  return {
    label: 'Rename frame',
    apply: (draft) => {
      const node = getNode(draft, frameId);
      if (!isFrame(node) || !trimmed || node.name === trimmed) {
        return;
      }
      node.name = trimmed;
    },
  };
}

export function renameImage(imageId: NodeId, name: string): Command {
  const trimmed = name.trim();
  return {
    label: 'Rename image',
    apply: (draft) => {
      const node = getNode(draft, imageId);
      if (!isImage(node) || !trimmed || node.name === trimmed) {
        return;
      }
      node.name = trimmed;
    },
  };
}

/** Move/resize Image placement rect (Graph or Canvas). Single History entry. */
export function transformImageRect(nodeId: NodeId, nextRect: Rect): Command {
  return {
    label: 'Transform image',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (!isImage(node)) {
        return;
      }
      const clamped = clampRectSize(nextRect);
      if (node.placement.kind === 'graph') {
        node.placement = { kind: 'graph', graph: clamped };
      } else {
        node.placement = {
          kind: 'canvas',
          canvasId: node.placement.canvasId,
          canvas: clamped,
        };
      }
    },
  };
}

export function moveFrameGraph(nodeId: NodeId, point: Point2D): Command {
  return {
    label: 'Move frame card',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isFrame(node)) {
        node.graph = { ...point };
      }
    },
  };
}

/**
 * Graph Frame transform: board position + crop size (crop origin unchanged).
 * Card rect is crop width/height at `graph`.
 */
export function transformFrameGraph(
  nodeId: NodeId,
  graph: Point2D,
  size: { width: number; height: number },
): Command {
  return {
    label: 'Transform frame',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isFrame(node)) {
        node.graph = { ...graph };
        node.crop = {
          ...node.crop,
          width: Math.max(1, size.width),
          height: Math.max(1, size.height),
        };
      }
    },
  };
}

export function moveFrameCrop(nodeId: NodeId, point: Point2D): Command {
  return {
    label: 'Move frame crop',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isFrame(node)) {
        node.crop = { ...node.crop, x: point.x, y: point.y };
      }
    },
  };
}

export function resizeFrameCrop(
  nodeId: NodeId,
  size: { width: number; height: number },
): Command {
  return {
    label: 'Resize frame crop',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isFrame(node)) {
        node.crop = {
          ...node.crop,
          width: Math.max(1, size.width),
          height: Math.max(1, size.height),
        };
      }
    },
  };
}

/** Set full Frame crop rect (move + resize in one History entry). */
export function setFrameCrop(nodeId: NodeId, crop: Rect): Command {
  return {
    label: 'Set frame crop',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isFrame(node)) {
        node.crop = {
          x: crop.x,
          y: crop.y,
          width: Math.max(1, crop.width),
          height: Math.max(1, crop.height),
        };
      }
    },
  };
}

export function moveGraphText(nodeId: NodeId, point: Point2D): Command {
  return {
    label: 'Move graph text',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isGraphText(node)) {
        node.graph = { ...node.graph, x: point.x, y: point.y };
      }
    },
  };
}

export function resizeGraphText(
  nodeId: NodeId,
  size: { width: number; height: number },
): Command {
  return {
    label: 'Resize graph text',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isGraphText(node)) {
        node.graph = {
          ...node.graph,
          width: Math.max(1, size.width),
          height: Math.max(1, size.height),
        };
      }
    },
  };
}

export function moveCanvasText(nodeId: NodeId, point: Point2D): Command {
  return {
    label: 'Move canvas text',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isCanvasText(node)) {
        node.canvas = { ...node.canvas, x: point.x, y: point.y };
      }
    },
  };
}

export function resizeCanvasText(
  nodeId: NodeId,
  size: { width: number; height: number },
): Command {
  return {
    label: 'Resize canvas text',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isCanvasText(node)) {
        node.canvas = {
          ...node.canvas,
          width: Math.max(1, size.width),
          height: Math.max(1, size.height),
        };
      }
    },
  };
}

export function moveSketch(nodeId: NodeId, point: Point2D): Command {
  return {
    label: 'Move sketch',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isSketch(node)) {
        node.canvas = { ...node.canvas, x: point.x, y: point.y };
        syncParentContainerBounds(draft, nodeId);
      }
    },
  };
}

export function resizeSketch(
  nodeId: NodeId,
  rect: { x: number; y: number; width: number; height: number },
): Command {
  return {
    label: 'Resize sketch',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isSketch(node)) {
        node.canvas = {
          x: rect.x,
          y: rect.y,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        };
        syncParentContainerBounds(draft, nodeId);
      }
    },
  };
}

/**
 * Reorder a stackable Node in its unified surface stack (History).
 * Canvas: Sketch + Image; Graph: Frame + Image.
 */
export function reorderSurfaceStack(
  nodeId: NodeId,
  action: SketchStackAction,
  graphId?: GraphId | null,
): Command {
  return {
    label: surfaceStackActionLabel(action),
    apply: (draft) => {
      const resolved = resolveSurfaceStackForNode(draft, nodeId, graphId);
      if (!resolved) {
        return;
      }
      const orders = computeSurfaceStackOrders(
        resolved.ordered,
        nodeId,
        action,
      );
      if (!orders) {
        return;
      }
      applySurfaceStackOrders(draft.nodes, orders);
    },
  };
}

/**
 * Move a stackable Node to an absolute index in its ascending surface stack
 * (Outliner drag). `graphId` required for Graph Images when the focused Graph
 * is not implied by the Node itself.
 */
export function moveNodeInSurfaceStack(
  nodeId: NodeId,
  toIndex: number,
  graphId?: GraphId | null,
): Command {
  return {
    label: 'Reorder stack',
    apply: (draft) => {
      const resolved = resolveSurfaceStackForNode(draft, nodeId, graphId);
      if (!resolved) {
        return;
      }
      const orders = computeSurfaceStackOrdersToIndex(
        resolved.ordered,
        nodeId,
        toIndex,
      );
      if (!orders) {
        return;
      }
      applySurfaceStackOrders(draft.nodes, orders);
    },
  };
}

/** @deprecated Prefer reorderSurfaceStack — thin delegate for Sketch call sites. */
export function reorderSketchStack(
  sketchId: NodeId,
  action: SketchStackAction,
): Command {
  return {
    label: sketchStackActionLabel(action),
    apply: (draft) => {
      reorderSurfaceStack(sketchId, action).apply(draft);
    },
  };
}

/** @deprecated Prefer moveNodeInSurfaceStack — thin delegate. */
export function moveSketchInStack(sketchId: NodeId, toIndex: number): Command {
  return {
    label: 'Reorder sketch',
    apply: (draft) => {
      moveNodeInSurfaceStack(sketchId, toIndex).apply(draft);
    },
  };
}

/** @deprecated Prefer moveNodeInSurfaceStack — thin delegate. */
export function moveImageInStack(imageId: NodeId, toIndex: number): Command {
  return {
    label: 'Reorder image',
    apply: (draft) => {
      moveNodeInSurfaceStack(imageId, toIndex).apply(draft);
    },
  };
}

/** @deprecated Prefer moveNodeInSurfaceStack — thin delegate. */
export function moveFrameInStack(
  frameId: NodeId,
  graphId: GraphId,
  toIndex: number,
): Command {
  return {
    label: 'Reorder frame',
    apply: (draft) => {
      moveNodeInSurfaceStack(frameId, toIndex, graphId).apply(draft);
    },
  };
}

/**
 * Resize a Sketch and scale associated Sketch Data strokes with it.
 * Single History entry.
 */
export function transformSketchContents(
  nodeId: NodeId,
  nextRect: Rect,
): Command {
  return {
    label: 'Transform sketch',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (!isSketch(node)) {
        return;
      }

      const oldRect = { ...node.canvas };
      const clamped = clampRectSize(nextRect);
      if (
        oldRect.x === clamped.x &&
        oldRect.y === clamped.y &&
        oldRect.width === clamped.width &&
        oldRect.height === clamped.height
      ) {
        return;
      }

      const sketchData = draft.sketches[node.canvasId];
      if (sketchData) {
        const sketchCount = Object.values(draft.nodes).filter(
          (candidate) =>
            candidate.type === 'sketch' && candidate.canvasId === node.canvasId,
        ).length;
        scaleSketchPathsThroughRects(
          sketchData,
          oldRect,
          clamped,
          nodeId,
          sketchCount === 1 ? nodeId : null,
        );
      }
      node.inkScale =
        sketchInkScale(node) * strokeWidthScale(oldRect, clamped);
      node.canvas = clamped;
      syncParentContainerBounds(draft, nodeId);
    },
  };
}

/**
 * Translate multiple selected Nodes by the same world delta (one History entry).
 * Reuses single-node transform applies — Sketch strokes move with bounds.
 */
export function translateSelectedNodes(
  refs: readonly NodeRef[],
  delta: Point2D,
): Command {
  return {
    label: refs.length === 1 ? 'Move node' : 'Move nodes',
    apply: (draft) => {
      if (delta.x === 0 && delta.y === 0) {
        return;
      }
      for (const ref of refs) {
        const node = getNode(draft, ref.id);
        if (!node || node.locked || node.visible === false) {
          continue;
        }
        if (node.type === 'sketch' && ref.type === 'sketch') {
          const next = {
            ...node.canvas,
            x: node.canvas.x + delta.x,
            y: node.canvas.y + delta.y,
          };
          transformSketchContents(node.id, next).apply(draft);
        } else if (node.type === 'image' && ref.type === 'image') {
          const rect =
            node.placement.kind === 'graph'
              ? node.placement.graph
              : node.placement.canvas;
          transformImageRect(node.id, {
            ...rect,
            x: rect.x + delta.x,
            y: rect.y + delta.y,
          }).apply(draft);
        } else if (node.type === 'frame' && ref.type === 'frame') {
          transformFrameGraph(
            node.id,
            { x: node.graph.x + delta.x, y: node.graph.y + delta.y },
            { width: node.crop.width, height: node.crop.height },
          ).apply(draft);
        } else if (isContainerNode(node) && ref.type === 'container') {
          node.canvas = {
            ...node.canvas,
            x: node.canvas.x + delta.x,
            y: node.canvas.y + delta.y,
          };
          for (const memberId of node.memberIds) {
            const sketch = getNode(draft, memberId);
            if (!isSketch(sketch)) {
              continue;
            }
            transformSketchContents(memberId, {
              ...sketch.canvas,
              x: sketch.canvas.x + delta.x,
              y: sketch.canvas.y + delta.y,
            }).apply(draft);
          }
        }
      }
    },
  };
}

export function transformContainerContents(
  nodeId: NodeId,
  nextRect: Rect,
): Command {
  return {
    label: 'Transform container',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (!isContainerNode(node)) {
        return;
      }

      const oldRect = { ...node.canvas };
      const clamped = clampRectSize(nextRect);
      if (
        oldRect.x === clamped.x &&
        oldRect.y === clamped.y &&
        oldRect.width === clamped.width &&
        oldRect.height === clamped.height
      ) {
        return;
      }

      for (const memberId of node.memberIds) {
        const sketch = getNode(draft, memberId);
        if (!isSketch(sketch)) {
          continue;
        }
        const memberNext = mapMemberRectThroughGroupResize(
          oldRect,
          clamped,
          sketch.canvas,
        );
        transformSketchContents(memberId, memberNext).apply(draft);
      }
      node.canvas = clamped;
    },
  };
}

/** @deprecated Use transformContainerContents */
export const transformSketchGroupContents = transformContainerContents;

export function makeContainerFromSketch(sketchId: NodeId): Command {
  return {
    label: 'Make container',
    apply: (draft) => {
      const node = getNode(draft, sketchId);
      if (!isSketch(node)) {
        return;
      }
      if (containerIdForSketch(draft as never, sketchId) != null) {
        return;
      }
      const sketchData = draft.sketches[node.canvasId];
      if (sketchHasInkPaths(sketchData, sketchId)) {
        return;
      }
      const container: ContainerNode = {
        id: node.id,
        type: 'container',
        visible: node.visible,
        locked: node.locked,
        canvasId: node.canvasId,
        canvas: { ...node.canvas },
        memberIds: [],
        stackOrder: node.stackOrder,
        name: node.name,
        prompt: node.prompt,
      };
      draft.nodes[sketchId] = container;
    },
  };
}

export function groupSelection(
  selection: readonly NodeRef[],
  canvasId: CanvasId,
): Command {
  return {
    label: 'Group',
    apply: (draft) => {
      if (!canGroupSelection(draft as never, selection, canvasId)) {
        return;
      }
      const parts = parseGroupSelection(draft as never, selection, canvasId);
      if (!parts) {
        return;
      }
      const { containers, freeSketches } = parts;

      if (containers.length === 1) {
        const container = getNode(draft, containers[0]!.id);
        if (!isContainerNode(container)) {
          return;
        }
        for (const sketch of freeSketches) {
          if (!container.memberIds.includes(sketch.id)) {
            container.memberIds.push(sketch.id);
          }
        }
        container.canvas = recomputeContainerBounds(draft as never, container);
        return;
      }

      if (freeSketches.length < 2) {
        return;
      }
      const canvas = unionBoundsForRects(freeSketches.map((s) => s.canvas));
      const stack = listCanvasSurfaceStack(draft as never, canvasId);
      const container = buildContainer({
        canvasId,
        canvas,
        memberIds: freeSketches.map((s) => s.id),
        stackOrder: nextPeerStackOrder(stack),
        name: nextUntitledSketchGroupName(draft as never, canvasId),
      });
      insertOwnerWithOutput(draft, container);
    },
  };
}

/** @deprecated Use groupSelection */
export function groupSketches(
  sketchIds: NodeId[],
  canvasId: CanvasId,
): Command {
  const refs: NodeRef[] = sketchIds.map((id) => ({ type: 'sketch', id }));
  return groupSelection(refs, canvasId);
}

export function ungroupContainer(containerId: NodeId): Command {
  return {
    label: 'Ungroup',
    apply: (draft) => {
      const container = getNode(draft, containerId);
      if (!isContainerNode(container)) {
        return;
      }
      container.memberIds = [];
    },
  };
}

/** @deprecated Use ungroupContainer */
export const ungroupSketchGroup = ungroupContainer;

export function renameContainer(nodeId: NodeId, name: string): Command {
  return {
    label: 'Rename container',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isContainerNode(node)) {
        const trimmed = name.trim();
        if (trimmed) {
          node.name = trimmed;
        }
      }
    },
  };
}

/** @deprecated Use renameContainer */
export const renameSketchGroup = renameContainer;

export function setContainerPrompt(nodeId: NodeId, prompt: string): Command {
  return {
    label: 'Edit container prompt',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isContainerNode(node)) {
        node.prompt = prompt;
      }
    },
  };
}

/** @deprecated Use setContainerPrompt */
export const setSketchGroupPrompt = setContainerPrompt;

export function setFramePrompt(nodeId: NodeId, prompt: string): Command {
  return {
    label: 'Edit frame prompt',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isFrame(node)) {
        node.prompt = prompt;
      }
    },
  };
}

export function setFrameWindowUrl(nodeId: NodeId, url: string | undefined): Command {
  return {
    label: 'Set frame window',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isFrame(node)) {
        if (url === undefined || url.trim() === '') {
          delete node.frameWindowUrl;
        } else {
          node.frameWindowUrl = url;
        }
      }
    },
  };
}

export function setSketchPrompt(nodeId: NodeId, prompt: string): Command {
  return {
    label: 'Edit sketch prompt',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isSketch(node)) {
        node.prompt = prompt;
      }
    },
  };
}

export function setImagePrompt(nodeId: NodeId, prompt: string): Command {
  return {
    label: 'Edit image prompt',
    apply: (draft) => {
      const node = getNode(draft, nodeId);
      if (isImage(node)) {
        node.prompt = prompt;
      }
    },
  };
}

export function insertNodes(nodes: Node[]): Command {
  return {
    label: nodes.length === 1 ? 'Paste node' : 'Paste nodes',
    apply: (draft) => {
      for (const node of nodes) {
        draft.nodes[node.id] = node;
      }
    },
  };
}
