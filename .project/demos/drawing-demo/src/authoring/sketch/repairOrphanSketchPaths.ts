import type { NodeId } from '../ids';
import type { SketchData, Stroke } from '../types';
import { resolvePaletteSublayerForLayer } from './paletteSublayer';
import { buildSublayer } from './factories';

export type RepairOrphanSketchPathsArgs = {
  sketch: SketchData;
  sketchId: NodeId;
  ownedBrushIds: ReadonlySet<string>;
  destinationBrushId: string;
};

function ensureDestinationSublayer(
  sketch: SketchData,
  destinationBrushId: string,
) {
  const layer = sketch.layers[0];
  if (!layer) {
    return null;
  }
  const resolution = resolvePaletteSublayerForLayer(layer, destinationBrushId);
  if (resolution.kind === 'existing') {
    return resolution.sublayer;
  }
  if (resolution.kind === 'claim') {
    resolution.sublayer.paletteId = destinationBrushId;
    return resolution.sublayer;
  }
  const created = buildSublayer({ paletteId: destinationBrushId });
  layer.sublayers.push(created);
  return created;
}

/** True when sketchId has paths on a sublayer keyed by a non-owned brush id. */
export function hasOrphanSketchPaths(
  sketch: SketchData,
  sketchId: NodeId,
  ownedBrushIds: ReadonlySet<string>,
): boolean {
  for (const layer of sketch.layers) {
    for (const sublayer of layer.sublayers) {
      const key = sublayer.paletteId;
      if (key != null && ownedBrushIds.has(key)) {
        continue;
      }
      if (sublayer.paths.some((path) => path.sketchId === sketchId)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Move paths belonging to `sketchId` off sublayers keyed by brush ids the
 * Sketch does not own (e.g. stale staging-brush keys from create-on-stroke)
 * onto the destination brush sublayer. Other Sketches' paths on those
 * sublayers are left in place.
 */
export function repairOrphanSketchPaths(
  args: RepairOrphanSketchPathsArgs,
): boolean {
  const { sketch, sketchId, ownedBrushIds, destinationBrushId } = args;
  if (!destinationBrushId) {
    return false;
  }

  const orphans: Stroke[] = [];
  for (const layer of sketch.layers) {
    for (const sublayer of layer.sublayers) {
      const key = sublayer.paletteId;
      if (key != null && ownedBrushIds.has(key)) {
        continue;
      }
      const keep: Stroke[] = [];
      for (const path of sublayer.paths) {
        if (path.sketchId === sketchId) {
          orphans.push(path);
        } else {
          keep.push(path);
        }
      }
      sublayer.paths = keep;
    }
  }

  if (orphans.length === 0) {
    return false;
  }

  const destination = ensureDestinationSublayer(sketch, destinationBrushId);
  if (!destination) {
    return false;
  }
  destination.paths.push(...orphans);
  return true;
}

/** Collect filled brush ids from a Sketch node's palette set. */
export function collectOwnedBrushIds(
  palettes: ReadonlyArray<{ brushes: ReadonlyArray<{ id: string } | null> }>,
): Set<string> {
  const ids = new Set<string>();
  for (const palette of palettes) {
    for (const brush of palette.brushes) {
      if (brush) {
        ids.add(brush.id);
      }
    }
  }
  return ids;
}
