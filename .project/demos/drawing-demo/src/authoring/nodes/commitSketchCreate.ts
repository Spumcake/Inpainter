import type { AuthoringWorkspace } from '../workspace/types';
import type { CanvasId, NodeId } from '../ids';
import { materializePaintStagingToPaletteSet } from '../../settings/configDomain';
import { activateSketch } from './activateSketch';
import { createNode } from './commands';
import { buildSketch, EMPTY_SKETCH_BOUNDS } from './factories';
import {
  listCanvasSurfaceStack,
  nextSurfaceStackOrder,
} from './surfaceStack';
import { nextUntitledSketchName } from './untitledSketchName';
import { setActiveTool } from '../session/sessionStore';
import type { Rect } from '../types';

function nextCanvasSurfaceOrder(
  workspace: Pick<AuthoringWorkspace, 'documentStore'>,
  canvasId: CanvasId,
): number {
  return nextSurfaceStackOrder(
    listCanvasSurfaceStack(workspace.documentStore.getState(), canvasId),
  );
}

/** Materialize paint staging into a Sketch-owned palette set, create Sketch, latch Select. */
export function commitCreatedSketch(
  workspace: AuthoringWorkspace,
  canvasId: CanvasId,
  rect: Rect,
): void {
  const state = workspace.documentStore.getState();
  const set = materializePaintStagingToPaletteSet(workspace.sessionStore);
  const node = buildSketch({
    canvasId,
    canvas: rect,
    stackOrder: nextCanvasSurfaceOrder(workspace, canvasId),
    name: nextUntitledSketchName(state, canvasId),
    palettes: set.palettes,
    paletteId: set.paletteId,
  });
  workspace.runner.dispatch(createNode(node));
  activateSketch(workspace, node.id);
  setActiveTool(workspace.sessionStore, 'select');
}

/**
 * Paint create-on-stroke: materialize Session paint staging into a new
 * Sketch-owned palette set, create empty Sketch, select + structure-target, stay on paint.
 * Caller commits the stroke with the returned id (bounds refit in commitStroke).
 */
export function commitPaintCreatedSketch(
  workspace: AuthoringWorkspace,
  canvasId: CanvasId,
): NodeId {
  const state = workspace.documentStore.getState();
  const set = materializePaintStagingToPaletteSet(workspace.sessionStore);
  const node = buildSketch({
    canvasId,
    canvas: { ...EMPTY_SKETCH_BOUNDS },
    stackOrder: nextCanvasSurfaceOrder(workspace, canvasId),
    name: nextUntitledSketchName(state, canvasId),
    palettes: set.palettes,
    paletteId: set.paletteId,
  });
  workspace.runner.dispatch(createNode(node));
  activateSketch(workspace, node.id);
  setActiveTool(workspace.sessionStore, 'paint');
  return node.id;
}
