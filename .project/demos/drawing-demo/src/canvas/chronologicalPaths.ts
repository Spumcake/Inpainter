import type { CanvasPath } from './engine/types';

/**
 * Chronological erase compositing tree:
 * - draw strokes stack on top of prior content
 * - erase groups wrap only content that already exists (not later paint)
 * Projection punch is SVG masks with zoom remount (see eraseCompositing.tsx).
 */
export type PathRenderLayer =
  | { kind: 'draws'; paths: CanvasPath[] }
  | { kind: 'masked'; erases: CanvasPath[]; children: PathRenderLayer[] };

export function buildChronologicalPathLayers(
  paths: CanvasPath[],
): PathRenderLayer[] {
  let layers: PathRenderLayer[] = [];
  let openDraws: CanvasPath[] = [];

  const flushDraws = () => {
    if (openDraws.length === 0) {
      return;
    }
    layers.push({ kind: 'draws', paths: openDraws });
    openDraws = [];
  };

  let index = 0;
  while (index < paths.length) {
    const path = paths[index]!;
    if (path.drawMode) {
      openDraws.push(path);
      index += 1;
      continue;
    }

    flushDraws();
    const erases: CanvasPath[] = [];
    while (index < paths.length && !paths[index]!.drawMode) {
      erases.push(paths[index]!);
      index += 1;
    }
    layers = [{ kind: 'masked', erases, children: layers }];
  }

  flushDraws();
  return layers;
}

/** Test helper: which draw-path indices sit under at least one erase mask. */
export function drawIndicesUnderEraseMask(paths: CanvasPath[]): number[] {
  const underMask: number[] = [];

  const visit = (layers: PathRenderLayer[], masked: boolean) => {
    for (const layer of layers) {
      if (layer.kind === 'draws') {
        if (!masked) {
          continue;
        }
        for (const path of layer.paths) {
          const drawIndex = paths.indexOf(path);
          if (drawIndex >= 0) {
            underMask.push(drawIndex);
          }
        }
        continue;
      }
      visit(layer.children, true);
    }
  };

  visit(buildChronologicalPathLayers(paths), false);
  return underMask;
}
