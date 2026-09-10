import type { Stroke, StrokePoint } from '../authoring/types';
import { buildChronologicalPathLayers } from './chronologicalPaths';
import type { CanvasPath, CanvasPoint } from './engine/types';
import { renderEraseCompositedLayers } from './eraseCompositing';
import { clampStrokeOpacity } from './strokeOpacity';

export const pathData = (points: CanvasPoint[]): string => {
  if (!points.length) return '';
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(' ');
};

export const clonePaths = (paths: CanvasPath[]) =>
  paths.map((path) => ({
    ...path,
    paths: path.paths.map((point) => ({ ...point })),
  }));

export function strokeToCanvasPath(stroke: Stroke): CanvasPath {
  const opacity =
    typeof stroke.attrs?.opacity === 'number'
      ? clampStrokeOpacity(stroke.attrs.opacity)
      : undefined;
  return {
    paths: stroke.points.map((point) => {
      const next: CanvasPoint = { x: point.x, y: point.y };
      if (typeof point.pressure === 'number' && Number.isFinite(point.pressure)) {
        next.pressure = point.pressure;
      }
      return next;
    }),
    strokeColor:
      typeof stroke.attrs?.strokeColor === 'string'
        ? stroke.attrs.strokeColor
        : '#000000',
    strokeWidth:
      typeof stroke.attrs?.strokeWidth === 'number'
        ? stroke.attrs.strokeWidth
        : 4,
    ...(opacity !== undefined ? { opacity } : {}),
    drawMode: stroke.attrs?.drawMode !== false,
  };
}

export function canvasPathToStrokePoints(path: CanvasPath): StrokePoint[] {
  return path.paths.map((point) => {
    const next: StrokePoint = { x: point.x, y: point.y };
    if (typeof point.pressure === 'number' && Number.isFinite(point.pressure)) {
      next.pressure = point.pressure;
    }
    return next;
  });
}

export function canvasPathToStrokeAttrs(path: CanvasPath): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    strokeColor: path.strokeColor,
    strokeWidth: path.strokeWidth,
    drawMode: path.drawMode,
  };
  if (path.drawMode && typeof path.opacity === 'number') {
    attrs.opacity = clampStrokeOpacity(path.opacity);
  }
  return attrs;
}

export const renderPaths = (
  paths: CanvasPath[],
  id: string,
  maskRevision: string = '1',
) => {
  const layers = buildChronologicalPathLayers(paths);
  if (layers.length === 0) {
    return null;
  }

  return (
    <g pointerEvents="none">
      {renderEraseCompositedLayers(
        layers,
        `${id}-root`,
        'none',
        maskRevision,
      )}
    </g>
  );
};

export const renderStrokes = (
  strokes: Stroke[],
  id: string,
  maskRevision: string = '1',
) => renderPaths(strokes.map(strokeToCanvasPath), id, maskRevision);

export { buildChronologicalPathLayers } from './chronologicalPaths';
export {
  eraseCompositedLayersToSvgMarkup,
  renderEraseCompositedLayers,
} from './eraseCompositing';
