import {
  asLayerId,
  asStrokeId,
  asSublayerId,
  createId,
  type NodeId,
  type StrokeId,
} from '../ids';
import type { Layer, Stroke, StrokePoint, Sublayer } from '../types';

export type BuildSublayerArgs = {
  paletteId?: string;
};

export type BuildLayerArgs = {
  name?: string;
};

export type BuildStrokeArgs = {
  points: StrokePoint[];
  attrs?: Record<string, unknown>;
  id?: StrokeId;
  sketchId?: NodeId;
};

export function buildSublayer(args: BuildSublayerArgs = {}): Sublayer {
  return {
    id: asSublayerId(createId('sublayer')),
    visible: true,
    locked: false,
    paletteId: args.paletteId,
    paths: [],
    objects: [],
  };
}

export function buildLayer(args: BuildLayerArgs = {}): Layer {
  return {
    id: asLayerId(createId('layer')),
    name: args.name ?? 'Layer',
    visible: true,
    locked: false,
    objects: [],
    sublayers: [buildSublayer()],
  };
}

export function buildStroke(args: BuildStrokeArgs): Stroke {
  return {
    id: args.id ?? asStrokeId(createId('stroke')),
    points: args.points,
    sketchId: args.sketchId,
    attrs: args.attrs,
  };
}
