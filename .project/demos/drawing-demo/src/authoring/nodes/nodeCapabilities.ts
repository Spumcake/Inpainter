import type { CanvasId } from '../ids';
import type { ActiveTool } from '../types/session';
import type { DocumentState } from '../types';
import type { Node, NodeType } from '../types/nodes';
import {
  FRAME_CHROME,
  FRAME_OUTPUT_CHROME,
  IMAGE_CHROME,
  OUTPUT_CHROME,
  SKETCH_CHROME,
  type NodeChrome,
} from './nodeChrome';
import { frameOwningResultImage, frameResultView } from './frameResultView';

/** Authoring surface — Graph board or Canvas view. */
export type AuthoringSurface = 'graph' | 'canvas';

/** Left-click context menu action ids — [`context-menu.md`](../../../docs/context-menu.md). */
export type ContextActionId =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'delete'
  | 'hide'
  | 'lock';

const FULL_CONTEXT_ACTIONS: readonly ContextActionId[] = [
  'cut',
  'copy',
  'paste',
  'delete',
  'hide',
  'lock',
];

export type NodeCapabilities = {
  /** Surfaces this type projects onto. Frame is both. */
  surfaces: readonly AuthoringSurface[];
  /**
   * Surfaces where the Select Prompt Editor may bind this type.
   * Empty = not promptable.
   */
  promptSurfaces: readonly AuthoringSurface[];
  /** Participates in Agent Node Focus / generation-loop ownership. */
  nodeFocus: boolean;
  /** Tools allowed while this type is selected (gated tools consult this). */
  compatibleTools: readonly ActiveTool[];
  /** Left-click context menu actions when this type is the menu target. */
  contextActions: readonly ContextActionId[];
  /** Select / metadata chrome; null when the type has no chrome. */
  chrome: NodeChrome | null;
  /**
   * Canvas id this node belongs to when Canvas-placed, else null.
   * Graph-only types and graph-placed Images return null.
   */
  canvasIdOf: (node: Node) => CanvasId | null;
};

function canvasIdFlat(node: Node): CanvasId | null {
  if (
    node.type === 'sketch' ||
    node.type === 'container' ||
    node.type === 'frame' ||
    node.type === 'canvasText'
  ) {
    return node.canvasId;
  }
  return null;
}

function canvasIdOfImage(node: Node): CanvasId | null {
  if (node.type !== 'image') {
    return null;
  }
  return node.placement.kind === 'canvas' ? node.placement.canvasId : null;
}

/**
 * Per-NodeType capability table — surface membership, prompt eligibility,
 * Node Focus, compatible tools, context-menu actions, and chrome. One fact per concern.
 */
export const NODE_CAPABILITIES: Record<NodeType, NodeCapabilities> = {
  sketch: {
    surfaces: ['canvas'],
    promptSurfaces: ['canvas'],
    nodeFocus: true,
    compatibleTools: ['select', 'paint', 'erase'],
    contextActions: FULL_CONTEXT_ACTIONS,
    chrome: SKETCH_CHROME,
    canvasIdOf: canvasIdFlat,
  },
  container: {
    surfaces: ['canvas'],
    promptSurfaces: ['canvas'],
    nodeFocus: true,
    compatibleTools: ['select', 'paint', 'erase'],
    contextActions: FULL_CONTEXT_ACTIONS,
    chrome: SKETCH_CHROME,
    canvasIdOf: canvasIdFlat,
  },
  frame: {
    surfaces: ['graph', 'canvas'],
    promptSurfaces: ['graph'],
    nodeFocus: true,
    compatibleTools: ['select', 'paint', 'erase'],
    contextActions: FULL_CONTEXT_ACTIONS,
    chrome: FRAME_CHROME,
    canvasIdOf: canvasIdFlat,
  },
  image: {
    surfaces: ['graph', 'canvas'],
    promptSurfaces: ['graph', 'canvas'],
    nodeFocus: true,
    compatibleTools: ['select'],
    contextActions: FULL_CONTEXT_ACTIONS,
    chrome: IMAGE_CHROME,
    canvasIdOf: canvasIdOfImage,
  },
  graphText: {
    surfaces: ['graph'],
    promptSurfaces: [],
    nodeFocus: false,
    compatibleTools: ['select'],
    contextActions: FULL_CONTEXT_ACTIONS,
    chrome: null,
    canvasIdOf: () => null,
  },
  canvasText: {
    surfaces: ['canvas'],
    promptSurfaces: [],
    nodeFocus: false,
    compatibleTools: ['select'],
    contextActions: FULL_CONTEXT_ACTIONS,
    chrome: null,
    canvasIdOf: canvasIdFlat,
  },
  output: {
    surfaces: ['canvas'],
    promptSurfaces: [],
    nodeFocus: false,
    /** Output is never Select-focusable; Agent chrome owns interaction. */
    compatibleTools: [],
    contextActions: [],
    chrome: OUTPUT_CHROME,
    canvasIdOf: () => null,
  },
};

export function capabilitiesFor(type: NodeType): NodeCapabilities {
  return NODE_CAPABILITIES[type];
}

export function isPromptableNodeType(type: NodeType): boolean {
  return NODE_CAPABILITIES[type].promptSurfaces.length > 0;
}

export function isNodeFocusType(type: NodeType): boolean {
  return NODE_CAPABILITIES[type].nodeFocus;
}

export function compatibleToolsForNodeType(
  type: NodeType,
): readonly ActiveTool[] {
  return NODE_CAPABILITIES[type].compatibleTools;
}

export function contextActionsForNodeType(
  type: NodeType,
): readonly ContextActionId[] {
  return NODE_CAPABILITIES[type].contextActions;
}

export function chromeForNodeType(type: NodeType): NodeChrome | null {
  return NODE_CAPABILITIES[type].chrome;
}

/**
 * Instance chrome: Frame output view (and that Frame’s result Image) use
 * agent orange; otherwise type chrome from {@link chromeForNodeType}.
 */
export function chromeForNode(
  node: Node,
  nodes: DocumentState['nodes'],
): NodeChrome | null {
  if (node.type === 'frame' && frameResultView(node) === 'output') {
    return FRAME_OUTPUT_CHROME;
  }
  if (node.type === 'image') {
    const owner = frameOwningResultImage({ nodes }, node.id);
    if (owner && frameResultView(owner) === 'output') {
      return FRAME_OUTPUT_CHROME;
    }
  }
  return chromeForNodeType(node.type);
}
