import type { CanvasId, LayerId, NodeId, SublayerId } from '../authoring/ids';
import type { AuthoringWorkspace } from '../authoring/workspace';
import type { SketchData } from '../authoring/types';
import { commitPaintCreatedSketch } from '../authoring/nodes/commitSketchCreate';
import { resolveStrokeTarget } from './strokeBridge';

export type PaintStrokeCommitArgs = {
  sketchId: NodeId;
  layerId: LayerId;
  sublayerId: SublayerId | null;
  paletteId: string | undefined;
};

export type ResolvePaintStrokeCommitArgsInput = {
  workspace: AuthoringWorkspace;
  canvasId: CanvasId;
  sketch: SketchData;
  activeLayerId: LayerId | null;
  /** Session activeBrushId (brush id; historical field name on the hook). */
  activePaletteId: string | null;
  activeSketchId: NodeId | null;
  createOnStroke: boolean;
};

/**
 * Resolve sketchId + palette/sublayer routing for a paint/erase commit.
 *
 * Create-on-stroke must create the Sketch *before* resolving the brush id —
 * materialize clones new brush ids and activateSketch updates Session. Resolving
 * first committed with the stale staging brush id and split ink across sublayers.
 */
export function resolvePaintStrokeCommitArgs(
  input: ResolvePaintStrokeCommitArgsInput,
): PaintStrokeCommitArgs | null {
  const {
    workspace,
    canvasId,
    sketch,
    activeLayerId,
    activePaletteId,
    activeSketchId,
    createOnStroke,
  } = input;

  if (createOnStroke) {
    const sketchId = commitPaintCreatedSketch(workspace, canvasId);
    const freshBrushId = workspace.sessionStore.getState().activeBrushId;
    const freshSketch =
      workspace.documentStore.getState().sketches[canvasId] ?? sketch;
    const target = resolveStrokeTarget(
      activeLayerId,
      freshSketch,
      freshBrushId,
    );
    if (!target) {
      return null;
    }
    return {
      sketchId,
      layerId: target.layerId,
      sublayerId: target.sublayerId,
      paletteId: freshBrushId ?? target.pendingPaletteId ?? undefined,
    };
  }

  const target = resolveStrokeTarget(activeLayerId, sketch, activePaletteId);
  if (!target || activeSketchId == null) {
    return null;
  }

  return {
    sketchId: activeSketchId,
    layerId: target.layerId,
    sublayerId: target.sublayerId,
    paletteId: activePaletteId ?? target.pendingPaletteId ?? undefined,
  };
}
