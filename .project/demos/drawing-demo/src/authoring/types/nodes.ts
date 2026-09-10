import type { DocumentPalette } from '../../settings/palette/types';
import type { CanvasId, LayerId, NodeId, SublayerId } from '../ids';

export type NodeType =
  | 'frame'
  | 'graphText'
  | 'canvasText'
  | 'sketch'
  | 'container'
  | 'image'
  | 'output';

export type NodeRef = {
  type: NodeType;
  id: NodeId;
};

export type NodeBase = {
  id: NodeId;
  type: NodeType;
  visible: boolean;
  locked: boolean;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point2D = {
  x: number;
  y: number;
};

export type FrameNode = NodeBase & {
  type: 'frame';
  canvasId: CanvasId;
  graph: Point2D;
  /** Peer order among Frames on the Graph board (0 = bottom … n−1 = top). */
  stackOrder: number;
  crop: Rect;
  /**
   * Output resolution (generation). Independent of crop / Graph card size.
   * Metadata pills read these; Select resize does not change them.
   */
  resolutionWidth: number;
  resolutionHeight: number;
  /** Durable display name (Untitled Frame / Untitled Frame 2 … on create). */
  name: string;
  prompt?: string;
  generationSettings?: Record<string, unknown>;
  /**
   * Indexer HTTP URL for Frame window contents after generation.
   * Legacy interim — new Frame jobs land `resultImageId` instead.
   * Not an Asset Library Asset — see glossary Frame window / Asset strict use.
   */
  frameWindowUrl?: string;
  /** Canvas Image Node id for the latest Frame generation result. */
  resultImageId?: NodeId;
  /**
   * Output–input presentation for this Frame’s generation relationship.
   * Default / omit = `input`. Durable Document field (History).
   */
  resultView?: 'input' | 'output';
};

export type GraphTextNode = NodeBase & {
  type: 'graphText';
  graph: Rect;
  text: string;
};

export type CanvasTextStyle = {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
};

export type CanvasTextNode = NodeBase & {
  type: 'canvasText';
  canvasId: CanvasId;
  layerId?: LayerId;
  sublayerId?: SublayerId;
  canvas: Rect & { rotation?: number };
  text: string;
  style?: CanvasTextStyle;
};

export type SketchNode = NodeBase & {
  type: 'sketch';
  canvasId: CanvasId;
  canvas: Rect;
  stackOrder: number;
  /** Durable display name (Untitled Sketch / Untitled Sketch 2 … on create). */
  name: string;
  /** Freeform prompt (Select Prompt Editor). Not a substitute for `name`. */
  prompt?: string;
  /**
   * Running product of Select content-scales (default 1; missing on load → 1).
   * World paint/erase width = logical tip × inkScale.
   */
  inkScale?: number;
  /** Palettes owned by this Sketch (shared slot axis within the set). */
  palettes: DocumentPalette[];
  /** Active palette id within `palettes`. */
  paletteId: string;
};

/** Canvas-only container for Sketch members (empty allowed). Collapsed Select treats as one Transformable. */
export type ContainerNode = NodeBase & {
  type: 'container';
  canvasId: CanvasId;
  /** Durable bounds (union of members when non-empty). */
  canvas: Rect;
  /** Sketch ids only; empty allowed. No nested containers. */
  memberIds: NodeId[];
  stackOrder: number;
  name: string;
  prompt?: string;
};

/** @deprecated Use ContainerNode */
export type SketchGroupNode = ContainerNode;

/** Single-surface membership: Graph board rect or Canvas rect. */
export type ImagePlacement =
  | { kind: 'graph'; graph: Rect }
  | { kind: 'canvas'; canvasId: CanvasId; canvas: Rect };

/**
 * Placed bitmap Node. Bytes are Document media via `mediaId` — not an Asset.
 * See desktop-ui/docs/image-node.md.
 */
export type ImageNode = NodeBase & {
  type: 'image';
  name: string;
  mediaId: string;
  placement: ImagePlacement;
  /** Peer order among Images on the same surface (0 = bottom … n−1 = top). */
  stackOrder: number;
  /** Durable freeform description — Select Prompt Editor (Canvas or Graph). */
  prompt?: string;
};

/** Owner types that participate in the generation loop (v1). */
export type OutputOwnerType = 'sketch' | 'container' | 'image' | 'frame';

/**
 * Framing Node owned by Sketch / Image / Frame.
 * Absolute Canvas rect is derived from host AABB + ratio + relativeScale.
 */
export type OutputNode = NodeBase & {
  type: 'output';
  ownerId: NodeId;
  /** Aspect as `W:H` (from prefs at create). */
  ratio: string;
  resolutionWidth: number;
  resolutionHeight: number;
  /** 1 = cover host AABB under Output aspect; linear multiplier. */
  relativeScale: number;
};

export type Node =
  | FrameNode
  | GraphTextNode
  | CanvasTextNode
  | SketchNode
  | ContainerNode
  | ImageNode
  | OutputNode;

export function nodeRefKey(ref: NodeRef): string {
  return `${ref.type}:${ref.id}`;
}

/** Normalize eng interim `boundingBox` records to Sketch Nodes. */
export function normalizeLegacyNode(raw: Node | (Omit<Node, 'type'> & { type: string; paletteId?: string; palettes?: DocumentPalette[]; canvasId?: CanvasId; canvas?: Rect; stackOrder?: number; name?: string })): Node {
  if (raw.type === 'boundingBox') {
    const legacy = raw as {
      id: NodeId;
      visible: boolean;
      locked: boolean;
      canvasId: CanvasId;
      canvas: Rect;
      stackOrder: number;
      name?: string;
      paletteId?: string;
      palettes?: DocumentPalette[];
    };
    const palettes = legacy.palettes ?? [];
    const trimmed = legacy.name?.trim();
    return {
      id: legacy.id,
      type: 'sketch',
      visible: legacy.visible,
      locked: legacy.locked,
      canvasId: legacy.canvasId,
      canvas: legacy.canvas,
      stackOrder: legacy.stackOrder,
      name: trimmed || 'Untitled Sketch',
      palettes,
      paletteId: legacy.paletteId ?? palettes[0]?.id ?? '',
    };
  }
  if (raw.type === 'sketch') {
    const sketch = raw as SketchNode & { palettes?: DocumentPalette[]; name?: string };
    const palettes = sketch.palettes ?? [];
    const trimmed = sketch.name?.trim();
    return {
      ...sketch,
      type: 'sketch',
      name: trimmed || 'Untitled Sketch',
      palettes,
      paletteId: sketch.paletteId || palettes[0]?.id || '',
    };
  }
  if (raw.type === 'frame') {
    const frame = raw as FrameNode & {
      name?: string;
      resolutionWidth?: number;
      resolutionHeight?: number;
      stackOrder?: number;
    };
    const trimmed = frame.name?.trim();
    const cropW = Math.max(1, Math.round(frame.crop?.width ?? 1280));
    const cropH = Math.max(1, Math.round(frame.crop?.height ?? 720));
    const resolutionWidth =
      typeof frame.resolutionWidth === 'number' &&
      Number.isFinite(frame.resolutionWidth) &&
      frame.resolutionWidth >= 1
        ? Math.round(frame.resolutionWidth)
        : cropW;
    const resolutionHeight =
      typeof frame.resolutionHeight === 'number' &&
      Number.isFinite(frame.resolutionHeight) &&
      frame.resolutionHeight >= 1
        ? Math.round(frame.resolutionHeight)
        : cropH;
    return {
      ...frame,
      type: 'frame',
      name: trimmed || 'Untitled Frame',
      resolutionWidth,
      resolutionHeight,
      stackOrder:
        typeof frame.stackOrder === 'number' && Number.isFinite(frame.stackOrder)
          ? frame.stackOrder
          : 0,
      ...(typeof frame.resultImageId === 'string' && frame.resultImageId
        ? { resultImageId: frame.resultImageId }
        : {}),
      ...(frame.resultView === 'output' || frame.resultView === 'input'
        ? { resultView: frame.resultView }
        : {}),
    };
  }
  if (raw.type === 'image') {
    const image = raw as ImageNode & { name?: string; stackOrder?: number };
    const trimmed = image.name?.trim();
    return {
      ...image,
      type: 'image',
      name: trimmed || 'Untitled Image',
      stackOrder:
        typeof image.stackOrder === 'number' && Number.isFinite(image.stackOrder)
          ? image.stackOrder
          : 0,
    };
  }
  if (raw.type === 'container' || raw.type === 'sketchGroup') {
    const container = raw as ContainerNode & {
      name?: string;
      memberIds?: NodeId[];
      stackOrder?: number;
    };
    const trimmed = container.name?.trim();
    const memberIds = Array.isArray(container.memberIds)
      ? [...new Set(container.memberIds.filter(Boolean))]
      : [];
    return {
      ...container,
      type: 'container',
      name: trimmed || 'Untitled Group',
      memberIds,
      stackOrder:
        typeof container.stackOrder === 'number' &&
        Number.isFinite(container.stackOrder)
          ? container.stackOrder
          : 0,
      canvas: container.canvas ?? { x: 0, y: 0, width: 1, height: 1 },
    };
  }
  return raw as Node;
}
