import type { LayerId, SublayerId } from '../authoring/ids';
import {
  isPaletteStrokeTargetAvailable,
  resolvePaletteStrokeTarget,
} from '../authoring/sketch';
import type { ActiveTool, SketchData, StrokePoint } from '../authoring/types';
import type { CanvasPath } from './engine/types';

export const DEFAULT_STROKE_COLOR = '#000000';
export const DEFAULT_STROKE_WIDTH = 4;

export function shouldCaptureStroke(activeTool: ActiveTool): boolean {
  return activeTool === 'paint' || activeTool === 'erase';
}

export function isStrokeCommitReady(points: StrokePoint[]): boolean {
  return points.length >= 2;
}

export function resolveStrokeTarget(
  activeLayerId: LayerId | null,
  sketch: SketchData,
  activePaletteId: string | null,
): { layerId: LayerId; sublayerId: SublayerId | null; pendingPaletteId?: string } | null {
  return resolvePaletteStrokeTarget(activeLayerId, sketch, activePaletteId);
}

export function isDrawingTargetAvailable(
  activeLayerId: LayerId | null,
  sketch: SketchData,
  activePaletteId: string | null,
): boolean {
  return isPaletteStrokeTargetAvailable(activeLayerId, sketch, activePaletteId);
}

export function detectCompletedPath(
  previousCount: number,
  paths: CanvasPath[],
  activeTool: ActiveTool,
): CanvasPath | null {
  if (paths.length <= previousCount) {
    return null;
  }

  const candidate = paths[paths.length - 1];
  if (!candidate || candidate.paths.length < 2) {
    return null;
  }

  if (activeTool === 'paint' && !candidate.drawMode) {
    return null;
  }

  if (activeTool === 'erase' && candidate.drawMode) {
    return null;
  }

  return candidate;
}
