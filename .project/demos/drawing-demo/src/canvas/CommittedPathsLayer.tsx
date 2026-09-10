import type { LayerId, SublayerId } from '../authoring/ids';
import { resolvePaletteStrokeTarget } from '../authoring/sketch';
import type { SketchData, Stroke, Sublayer } from '../authoring/types';
import { renderStrokes } from './pathUtils';
import {
  sortSublayersBySlot,
  sublayerSlotIndex,
} from './sortSublayersBySlot';
import { useViewportShell } from './viewport';

type CommittedPathsLayerProps = {
  sketch: SketchData;
  viewBox: string;
  /** Omit while the live engine owns this sublayer (erase preview). */
  excludeSublayerId?: SublayerId | null;
  /** brushId → shared slot index; drives paint order. */
  slotIndexByBrushId: Map<string, number>;
  /**
   * When set, only include sublayers whose slot index satisfies the predicate
   * (used to sandwich the live engine between below/above bands).
   */
  slotFilter?: (slotIndex: number) => boolean;
  /** When set, only strokes matching the predicate are drawn. */
  pathFilter?: (path: Stroke) => boolean;
  /** Avoid duplicate SVG element ids when rendering two bands. */
  idSuffix?: string;
  /**
   * Override erase-mask remount key. Defaults to viewport zoom.
   * Pass zoom+draft sx/sy during CSS transform preview so WebKit re-rasterizes masks.
   */
  maskRevision?: string;
};

function visibleOrderedSublayers(
  sublayers: Sublayer[],
  slotIndexByBrushId: Map<string, number>,
  excludeSublayerId: SublayerId | null,
  slotFilter?: (slotIndex: number) => boolean,
): Sublayer[] {
  const visible = sublayers.filter(
    (sublayer) => sublayer.visible && sublayer.id !== excludeSublayerId,
  );
  const ordered = sortSublayersBySlot(visible, slotIndexByBrushId);
  if (!slotFilter) return ordered;
  return ordered.filter((sublayer) =>
    slotFilter(sublayerSlotIndex(sublayer, slotIndexByBrushId)),
  );
}

/** Read-only projection of committed SketchData strokes (slot-ordered). */
export function CommittedPathsLayer({
  sketch,
  viewBox,
  excludeSublayerId = null,
  slotIndexByBrushId,
  slotFilter,
  pathFilter,
  idSuffix = '',
  maskRevision: maskRevisionOverride,
}: CommittedPathsLayerProps) {
  // Remount when CSS scale changes so WebKit re-rasterizes erase masks.
  const { viewport } = useViewportShell();
  const maskRevision =
    maskRevisionOverride ?? viewport.zoom.toFixed(4);

  return (
    <svg
      key={`committed${idSuffix}-${maskRevision}`}
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox={viewBox}
      pointerEvents="none"
    >
      {sketch.layers
        .filter((layer) => layer.visible)
        .map((layer) => (
          <g key={layer.id} id={`${layer.id}${idSuffix}`}>
            {visibleOrderedSublayers(
              layer.sublayers,
              slotIndexByBrushId,
              excludeSublayerId,
              slotFilter,
            ).map((sublayer) => {
              const paths = pathFilter
                ? sublayer.paths.filter(pathFilter)
                : sublayer.paths;
              if (paths.length === 0) {
                return null;
              }
              return (
                <g key={sublayer.id} id={`${sublayer.id}${idSuffix}`}>
                  {renderStrokes(
                    paths,
                    `${sublayer.id}${idSuffix}`,
                    maskRevision,
                  )}
                </g>
              );
            })}
          </g>
        ))}
    </svg>
  );
}

export type ActiveDrawTarget = {
  layerId: LayerId;
  sublayerId: SublayerId | null;
  pendingPaletteId?: string;
};

export function resolveActiveDrawTarget(
  sketch: SketchData,
  activeLayerId: LayerId | null,
  activePaletteId: string | null,
): ActiveDrawTarget | null {
  const target = resolvePaletteStrokeTarget(
    activeLayerId,
    sketch,
    activePaletteId,
  );
  if (!target) {
    return null;
  }

  const layer = sketch.layers.find((item) => item.id === target.layerId);
  if (!layer || !layer.visible || layer.locked) {
    return null;
  }

  if (target.pendingPaletteId) {
    return {
      layerId: target.layerId,
      sublayerId: null,
      pendingPaletteId: target.pendingPaletteId,
    };
  }

  const sublayer = layer.sublayers.find((item) => item.id === target.sublayerId);
  if (!sublayer || !sublayer.visible || sublayer.locked) {
    return null;
  }

  return {
    layerId: target.layerId,
    sublayerId: target.sublayerId,
  };
}
