import type { CanvasId, LayerId, NodeId, StrokeId, SublayerId } from '../ids';

export type StrokePoint = {
  x: number;
  y: number;
  pressure?: number;
};

export type Stroke = {
  id: StrokeId;
  points: StrokePoint[];
  /** Sketch Node this stroke belongs to. */
  sketchId?: NodeId;
  attrs?: Record<string, unknown>;
};

export type Sublayer = {
  id: SublayerId;
  visible: boolean;
  locked: boolean;
  paletteId?: string;
  paths: Stroke[];
  snapshotSvg?: string;
  objects: unknown[];
};

export type Layer = {
  id: LayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  objects: unknown[];
  sublayers: Sublayer[];
};

/** Eng-only drawing payload for one Canvas (Sketch Data). Not a hierarchy level. */
export type SketchData = {
  id: string;
  name?: string;
  width: number;
  height: number;
  layers: Layer[];
};

export type SketchDataByCanvas = Record<CanvasId, SketchData>;
