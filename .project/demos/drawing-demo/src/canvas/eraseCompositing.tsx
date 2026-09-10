import type { ReactNode } from 'react';
import { resolveStylusPreferences } from '../settings/resolveStylusPreferences';
import type { PathRenderLayer } from './chronologicalPaths';
import type { CanvasPath, CanvasPoint } from './engine/types';
import { canvasPathToStrokeSegments } from './pressureStroke';
import { pathStrokeOpacity } from './strokeOpacity';

/**
 * Chronological erase punch via SVG `<mask maskUnits="userSpaceOnUse">`.
 *
 * WebKitGTK under ViewportShell CSS `scale(zoom)` can leave mask bitmaps
 * misaligned until pan. Callers must pass a `maskRevision` that changes with
 * zoom (and remount the projecting SVG/group) so masks re-rasterize.
 *
 * Do NOT use `mix-blend-mode: destination-out` on SVG — unsupported on WebKit
 * SVG elements (erase paints black instead of punching). See drawing-system.md.
 */

/** Local path `d` builder — avoids circular import with pathUtils. */
function pathD(points: CanvasPoint[]): string {
  if (!points.length) return '';
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(' ');
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function pathSegments(path: CanvasPath) {
  return canvasPathToStrokeSegments(path, resolveStylusPreferences(), pathD);
}

function renderDrawPath(
  path: CanvasPath,
  key: string,
  pointerEvents: 'none' | undefined,
): ReactNode {
  const opacity = pathStrokeOpacity(path);
  return pathSegments(path).map((segment, segmentIndex) => (
    <path
      key={`${key}-s${segmentIndex}`}
      d={segment.d}
      fill="none"
      stroke={path.strokeColor}
      strokeWidth={segment.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
      pointerEvents={pointerEvents}
    />
  ));
}

/** React projection of chronological paint/erase layers (committed + live). */
export function renderEraseCompositedLayers(
  layers: PathRenderLayer[],
  keyPrefix: string,
  pointerEvents?: 'none',
  maskRevision: string = '1',
): ReactNode[] {
  return layers.map((layer, layerIndex) => {
    const layerKey = `${keyPrefix}-${layerIndex}`;
    if (layer.kind === 'draws') {
      return (
        <g key={layerKey}>
          {layer.paths.map((path, pathIndex) =>
            renderDrawPath(path, `${layerKey}-d${pathIndex}`, pointerEvents),
          )}
        </g>
      );
    }

    const maskId = `${layerKey}-m-${maskRevision}`;
    return (
      <g key={`${layerKey}-${maskRevision}`}>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect
              x={-100000}
              y={-100000}
              width={200000}
              height={200000}
              fill="#fff"
            />
            {layer.erases.flatMap((path, eraseIndex) =>
              pathSegments(path).map((segment, segmentIndex) => (
                <path
                  key={`${layerKey}-e${eraseIndex}-s${segmentIndex}`}
                  d={segment.d}
                  fill="none"
                  stroke="#000"
                  strokeWidth={segment.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )),
            )}
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          {renderEraseCompositedLayers(
            layer.children,
            `${layerKey}-c`,
            pointerEvents,
            maskRevision,
          )}
        </g>
      </g>
    );
  });
}

function drawPathMarkup(path: CanvasPath): string {
  const opacity = pathStrokeOpacity(path);
  const opacityAttr = opacity === undefined ? '' : ` opacity="${opacity}"`;
  return pathSegments(path)
    .map(
      (segment) =>
        `<path d="${segment.d}" fill="none" stroke="${escapeXml(path.strokeColor)}" stroke-width="${segment.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${opacityAttr} />`,
    )
    .join('');
}

function eraseMaskPathMarkup(path: CanvasPath): string {
  return pathSegments(path)
    .map(
      (segment) =>
        `<path d="${segment.d}" fill="none" stroke="#000" stroke-width="${segment.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`,
    )
    .join('');
}

/** SVG markup export — same mask punch (export is not under CSS scale). */
export function eraseCompositedLayersToSvgMarkup(
  layers: PathRenderLayer[],
  idPrefix: string = 'export',
): string {
  return layers
    .map((layer, layerIndex) => {
      const layerId = `${idPrefix}-${layerIndex}`;
      if (layer.kind === 'draws') {
        return layer.paths.map(drawPathMarkup).join('');
      }
      const maskId = `${layerId}-mask`;
      const erasers = layer.erases.map(eraseMaskPathMarkup).join('');
      const children = eraseCompositedLayersToSvgMarkup(
        layer.children,
        `${layerId}-c`,
      );
      return `<defs><mask id="${maskId}" maskUnits="userSpaceOnUse"><rect x="-100000" y="-100000" width="200000" height="200000" fill="#fff" />${erasers}</mask></defs><g mask="url(#${maskId})">${children}</g>`;
    })
    .join('');
}
