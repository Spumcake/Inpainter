import { getNewBrushTemplate } from '../../settings/factory/loadDocumentPreferencesFactory';
import type { DocumentPalette } from '../../settings/palette/types';
import {
  asNodeId,
  createId,
  type CanvasId,
  type LayerId,
  type NodeId,
  type SublayerId,
} from '../ids';
import type {
  CanvasTextNode,
  FrameNode,
  GraphTextNode,
  ImageNode,
  ImagePlacement,
  OutputNode,
  Point2D,
  Rect,
  ContainerNode,
  SketchNode,
} from '../types';
import { UNTITLED_FRAME_LABEL } from './untitledFrameName';
import { UNTITLED_IMAGE_LABEL } from './untitledImageName';
import { UNTITLED_SKETCH_LABEL } from './untitledSketchName';
import { UNTITLED_GROUP_LABEL } from './untitledSketchGroupName';

/** Minimal one-palette set for tests / fixtures (name `Palette 1`). */
export function paletteSetWithId(
  id: string,
  name = 'Palette 1',
): DocumentPalette[] {
  return [
    {
      id,
      name,
      brushes: [
        {
          id: `${id}-b0`,
          name: 'Brush 1',
          ...getNewBrushTemplate(),
        },
      ],
    },
  ];
}

export const DEFAULT_FRAME_CROP: Rect = {
  x: 0,
  y: 0,
  width: 1280,
  height: 720,
};

export const DEFAULT_FRAME_RESOLUTION = {
  width: 1280,
  height: 720,
} as const;

/** Empty Sketch bounds until first stroke refits (paint create-on-stroke / drag-create). */
export const EMPTY_SKETCH_BOUNDS: Rect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
};

/** True when Sketch bounds are large enough to show Select chrome. */
export function hasSelectableSketchBounds(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0;
}

export const DEFAULT_GRAPH_TEXT_RECT: Rect = {
  x: 0,
  y: 0,
  width: 200,
  height: 40,
};

export type BuildFrameArgs = {
  canvasId: CanvasId;
  graph?: Point2D;
  crop?: Rect;
  /** Peer order among Frames on the Graph. Defaults to 0. */
  stackOrder?: number;
  /** Output resolution — independent of crop. Defaults to starter 1280×720. */
  resolutionWidth?: number;
  resolutionHeight?: number;
  name?: string;
  prompt?: string;
  generationSettings?: Record<string, unknown>;
  frameWindowUrl?: string;
  visible?: boolean;
  locked?: boolean;
};

export type BuildGraphTextArgs = {
  graph?: Rect;
  text?: string;
  visible?: boolean;
  locked?: boolean;
};

export type BuildCanvasTextArgs = {
  canvasId: CanvasId;
  canvas?: Rect & { rotation?: number };
  text?: string;
  layerId?: LayerId;
  sublayerId?: SublayerId;
  style?: CanvasTextNode['style'];
  visible?: boolean;
  locked?: boolean;
};

export type BuildSketchArgs = {
  canvasId: CanvasId;
  canvas?: Rect;
  stackOrder?: number;
  /** Durable display name. Defaults to `Untitled Sketch` when omitted (tests/fixtures). */
  name?: string;
  /** Freeform prompt (Select Prompt Editor). */
  prompt?: string;
  /** Content-scale product for tip→world stroke width. Defaults to 1. */
  inkScale?: number;
  /** Owned palette set (≥1). */
  palettes: DocumentPalette[];
  /** Active palette within `palettes`. Defaults to first. */
  paletteId?: string;
  visible?: boolean;
  locked?: boolean;
};

export type BuildContainerArgs = {
  id?: NodeId;
  canvasId: CanvasId;
  canvas: Rect;
  memberIds: NodeId[];
  stackOrder?: number;
  name?: string;
  prompt?: string;
  visible?: boolean;
  locked?: boolean;
};

/** @deprecated Use BuildContainerArgs */
export type BuildSketchGroupArgs = BuildContainerArgs;

export type BuildImageArgs = {
  mediaId: string;
  placement: ImagePlacement;
  /** Peer order among Images on the same surface. Defaults to 0. */
  stackOrder?: number;
  name?: string;
  prompt?: string;
  visible?: boolean;
  locked?: boolean;
};

export type BuildOutputArgs = {
  ownerId: NodeId;
  ratio?: string;
  resolutionWidth?: number;
  resolutionHeight?: number;
  relativeScale?: number;
  visible?: boolean;
  locked?: boolean;
};

export function buildFrame(args: BuildFrameArgs): FrameNode {
  const trimmed = args.name?.trim();
  const crop = args.crop ?? { ...DEFAULT_FRAME_CROP };
  return {
    id: asNodeId(createId('node')),
    type: 'frame',
    visible: args.visible ?? true,
    locked: args.locked ?? false,
    canvasId: args.canvasId,
    graph: args.graph ?? { x: 0, y: 0 },
    stackOrder: args.stackOrder ?? 0,
    crop,
    resolutionWidth: Math.max(
      1,
      Math.round(args.resolutionWidth ?? DEFAULT_FRAME_RESOLUTION.width),
    ),
    resolutionHeight: Math.max(
      1,
      Math.round(args.resolutionHeight ?? DEFAULT_FRAME_RESOLUTION.height),
    ),
    name: trimmed || UNTITLED_FRAME_LABEL,
    prompt: args.prompt,
    generationSettings: args.generationSettings,
    frameWindowUrl: args.frameWindowUrl,
  };
}

export function buildGraphText(args: BuildGraphTextArgs = {}): GraphTextNode {
  return {
    id: asNodeId(createId('node')),
    type: 'graphText',
    visible: args.visible ?? true,
    locked: args.locked ?? false,
    graph: args.graph ?? { ...DEFAULT_GRAPH_TEXT_RECT },
    text: args.text ?? '',
  };
}

export function buildCanvasText(args: BuildCanvasTextArgs): CanvasTextNode {
  return {
    id: asNodeId(createId('node')),
    type: 'canvasText',
    visible: args.visible ?? true,
    locked: args.locked ?? false,
    canvasId: args.canvasId,
    layerId: args.layerId,
    sublayerId: args.sublayerId,
    canvas: args.canvas ?? { ...DEFAULT_GRAPH_TEXT_RECT },
    text: args.text ?? '',
    style: args.style,
  };
}

export function buildSketch(args: BuildSketchArgs): SketchNode {
  if (args.palettes.length === 0) {
    throw new Error('buildSketch requires a non-empty palettes set');
  }
  const paletteId =
    args.paletteId && args.palettes.some((p) => p.id === args.paletteId)
      ? args.paletteId
      : args.palettes[0]!.id;
  return {
    id: asNodeId(createId('node')),
    type: 'sketch',
    visible: args.visible ?? true,
    locked: args.locked ?? false,
    canvasId: args.canvasId,
    canvas: args.canvas ?? { ...DEFAULT_FRAME_CROP },
    stackOrder: args.stackOrder ?? 0,
    name: args.name?.trim() || UNTITLED_SKETCH_LABEL,
    prompt: args.prompt,
    inkScale: args.inkScale ?? 1,
    palettes: args.palettes,
    paletteId,
  };
}

export function buildContainer(args: BuildContainerArgs): ContainerNode {
  return {
    id: args.id ?? asNodeId(createId('node')),
    type: 'container',
    visible: args.visible ?? true,
    locked: args.locked ?? false,
    canvasId: args.canvasId,
    canvas: args.canvas,
    memberIds: [...args.memberIds],
    stackOrder: args.stackOrder ?? 0,
    name: args.name?.trim() || UNTITLED_GROUP_LABEL,
    prompt: args.prompt,
  };
}

/** @deprecated Use buildContainer */
export const buildSketchGroup = buildContainer;

export function buildOutput(args: BuildOutputArgs): OutputNode {
  return {
    id: asNodeId(createId('node')),
    type: 'output',
    visible: args.visible ?? true,
    locked: args.locked ?? false,
    ownerId: args.ownerId,
    ratio: args.ratio?.trim() || '1:1',
    resolutionWidth: Math.max(
      1,
      Math.round(args.resolutionWidth ?? 1024),
    ),
    resolutionHeight: Math.max(
      1,
      Math.round(args.resolutionHeight ?? 1024),
    ),
    relativeScale: Math.max(0.01, args.relativeScale ?? 1),
  };
}

export function buildImage(args: BuildImageArgs): ImageNode {
  return {
    id: asNodeId(createId('node')),
    type: 'image',
    visible: args.visible ?? true,
    locked: args.locked ?? false,
    name: args.name?.trim() || UNTITLED_IMAGE_LABEL,
    mediaId: args.mediaId,
    placement: structuredClone(args.placement),
    stackOrder: args.stackOrder ?? 0,
    prompt: args.prompt,
  };
}
