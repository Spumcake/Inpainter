import type { LayerId, SublayerId } from '../ids';
import type { Layer, SketchData, Sublayer } from '../types';
import { findLayer } from './helpers';

export function findPaletteSublayer(
  layer: Layer,
  paletteId: string,
): Sublayer | undefined {
  return layer.sublayers.find((sublayer) => sublayer.paletteId === paletteId);
}

export function findUnboundSublayer(layer: Layer): Sublayer | undefined {
  return layer.sublayers.find((sublayer) => !sublayer.paletteId);
}

export type PaletteSublayerResolution =
  | { kind: 'existing'; sublayer: Sublayer }
  | { kind: 'claim'; sublayer: Sublayer; paletteId: string }
  | { kind: 'create'; paletteId: string };

export function resolvePaletteSublayerForLayer(
  layer: Layer,
  paletteId: string,
): PaletteSublayerResolution {
  const keyed = findPaletteSublayer(layer, paletteId);
  if (keyed) {
    return { kind: 'existing', sublayer: keyed };
  }

  const unbound = findUnboundSublayer(layer);
  if (unbound) {
    return { kind: 'claim', sublayer: unbound, paletteId };
  }

  return { kind: 'create', paletteId };
}

export type StrokeTargetResolution = {
  layerId: LayerId;
  sublayerId: SublayerId | null;
  pendingPaletteId?: string;
};

export function resolvePaletteStrokeTarget(
  activeLayerId: LayerId | null,
  sketch: SketchData,
  activePaletteId: string | null,
): StrokeTargetResolution | null {
  const layer =
    (activeLayerId ? findLayer(sketch, activeLayerId) : undefined) ??
    sketch.layers[0];
  if (!layer) {
    return null;
  }

  if (activePaletteId) {
    const resolution = resolvePaletteSublayerForLayer(layer, activePaletteId);
    if (resolution.kind === 'existing' || resolution.kind === 'claim') {
      return {
        layerId: layer.id,
        sublayerId: resolution.sublayer.id,
      };
    }
    return {
      layerId: layer.id,
      sublayerId: null,
      pendingPaletteId: activePaletteId,
    };
  }

  const sublayer = layer.sublayers[0];
  if (!sublayer) {
    return null;
  }

  return {
    layerId: layer.id,
    sublayerId: sublayer.id,
  };
}

export function isPaletteStrokeTargetAvailable(
  activeLayerId: LayerId | null,
  sketch: SketchData,
  activePaletteId: string | null,
): boolean {
  const target = resolvePaletteStrokeTarget(
    activeLayerId,
    sketch,
    activePaletteId,
  );
  if (!target) {
    return false;
  }

  const layer = findLayer(sketch, target.layerId);
  if (!layer || !layer.visible || layer.locked) {
    return false;
  }

  if (target.pendingPaletteId) {
    return true;
  }

  const sublayer = layer.sublayers.find((item) => item.id === target.sublayerId);
  if (!sublayer || !sublayer.visible || sublayer.locked) {
    return false;
  }

  return true;
}
