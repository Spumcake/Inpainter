import type { LayerId, NodeId, SublayerId } from '../authoring/ids';
import { strokeBelongsToSketch } from '../authoring/nodes';
import type { SketchData, Sublayer } from '../authoring/types';
import { findPaletteSublayer } from '../authoring/sketch/paletteSublayer';

/**
 * Sublayer to hydrate into the live erase engine (and temporarily exclude from
 * the erase-target Sketch’s committed band only — see erasePreviewExcludeForBand).
 * Null when erase has no Sketch target — must not steal a sublayer with an empty
 * path list (would blank the target Sketch’s preview).
 */
export function resolveErasePreviewSublayerId(args: {
  isEraseTool: boolean;
  eraseTargetSketchId: NodeId | null;
  activeSublayerId: SublayerId | null | undefined;
}): SublayerId | null {
  if (!args.isEraseTool || args.eraseTargetSketchId == null) {
    return null;
  }
  return args.activeSublayerId ?? null;
}

/** Empty filtered lists must not count as an active erase preview. */
export function erasePreviewPathsOrNull<T>(paths: T[]): T[] | null {
  return paths.length === 0 ? null : paths;
}

/**
 * Erase-preview sublayer exclusion applies only to the erase-target Sketch’s
 * committed band. Other Sketches may share that sublayer (same brush key) and
 * must keep projecting their own paths — the live engine only holds the target.
 */
export function erasePreviewExcludeForBand(
  excludeSublayerId: SublayerId | null,
  bandSketchId: NodeId,
  eraseTargetSketchId: NodeId | null,
): SublayerId | null {
  if (
    excludeSublayerId == null ||
    eraseTargetSketchId == null ||
    bandSketchId !== eraseTargetSketchId
  ) {
    return null;
  }
  return excludeSublayerId;
}

function sublayerHasInkForSketch(
  sublayer: Sublayer,
  eraseTargetSketchId: NodeId,
  soleSketch: boolean,
): boolean {
  const soleSketchId = soleSketch ? eraseTargetSketchId : null;
  return sublayer.paths.some((path) =>
    strokeBelongsToSketch(path, eraseTargetSketchId, soleSketchId),
  );
}

/**
 * Brush id whose sublayer holds ink for the erase-target Sketch.
 * Prefers `preferredBrushId` when it has matching paths; otherwise the first
 * keyed sublayer on the layer with matching ink. Returns preferred unchanged
 * when the Sketch has no ink (empty erase target — no preview takeover).
 */
export function resolveEraseBrushId(args: {
  sketch: SketchData;
  layerId: LayerId | null;
  eraseTargetSketchId: NodeId;
  preferredBrushId: string | null;
  soleSketch: boolean;
}): string | null {
  const layer =
    (args.layerId
      ? args.sketch.layers.find((item) => item.id === args.layerId)
      : undefined) ?? args.sketch.layers[0];
  if (!layer) {
    return args.preferredBrushId;
  }

  if (args.preferredBrushId) {
    const preferred = findPaletteSublayer(layer, args.preferredBrushId);
    if (
      preferred &&
      sublayerHasInkForSketch(
        preferred,
        args.eraseTargetSketchId,
        args.soleSketch,
      )
    ) {
      return args.preferredBrushId;
    }
  }

  for (const sublayer of layer.sublayers) {
    if (
      sublayer.paletteId &&
      sublayerHasInkForSketch(
        sublayer,
        args.eraseTargetSketchId,
        args.soleSketch,
      )
    ) {
      return sublayer.paletteId;
    }
  }

  return args.preferredBrushId;
}
