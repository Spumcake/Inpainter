import type { CanvasId, LayerId, SublayerId } from '../ids';
import type { DocumentState, Layer, SketchData, Sublayer } from '../types';

export function getSketch(
  draft: DocumentState,
  canvasId: CanvasId,
): SketchData | undefined {
  return draft.sketches[canvasId];
}

export function findLayer(
  sketch: SketchData,
  layerId: LayerId,
): Layer | undefined {
  return sketch.layers.find((layer) => layer.id === layerId);
}

export function findLayerIndex(
  sketch: SketchData,
  layerId: LayerId,
): number {
  return sketch.layers.findIndex((layer) => layer.id === layerId);
}

export function findSublayer(
  layer: Layer,
  sublayerId: SublayerId,
): Sublayer | undefined {
  return layer.sublayers.find((sublayer) => sublayer.id === sublayerId);
}

export function findSublayerIndex(
  layer: Layer,
  sublayerId: SublayerId,
): number {
  return layer.sublayers.findIndex((sublayer) => sublayer.id === sublayerId);
}

export function moveArrayItem<T>(
  array: T[],
  fromIndex: number,
  toIndex: number,
): void {
  if (fromIndex < 0 || fromIndex >= array.length) {
    return;
  }
  const clamped = Math.max(0, Math.min(toIndex, array.length - 1));
  if (fromIndex === clamped) {
    return;
  }
  const [item] = array.splice(fromIndex, 1);
  if (item !== undefined) {
    array.splice(clamped, 0, item);
  }
}
