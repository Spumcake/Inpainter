import type { ViewportState } from '../authoring/types';
import type { Viewport } from './viewport';

export function sessionToShellViewport(viewport: ViewportState): Viewport {
  return {
    x: viewport.panX,
    y: viewport.panY,
    zoom: viewport.zoom,
  };
}

export function shellToSessionViewport(viewport: Viewport): ViewportState {
  return {
    panX: viewport.x,
    panY: viewport.y,
    zoom: viewport.zoom,
  };
}

export function isDefaultSessionViewport(viewport: ViewportState): boolean {
  return viewport.panX === 0 && viewport.panY === 0 && viewport.zoom === 1;
}
