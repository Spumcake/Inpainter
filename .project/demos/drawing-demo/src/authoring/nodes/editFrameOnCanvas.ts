import type { AuthoringWorkspace } from '../workspace/types';
import type { NodeId } from '../ids';
import {
  requestViewportFit,
  setActiveTool,
  setCanvasFrameId,
  setSelection,
} from '../session/sessionStore';
import {
  clearSurfaceResumeEntry,
  surfaceResumeKey,
} from '../session/surfaceResume';
import type { FrameNode } from '../types';

/**
 * Frame pill Edit (Graph): open the Frame’s Canvas with Select latched,
 * clear any prior Canvas surface resume, center on the crop, keep Graph zoom.
 * Selection is cleared — Canvas Frame is not selectable on Canvas.
 * Sets Session `canvasFrameId` so Canvas shows that Frame’s underlay + dim.
 */
export function editFrameOnCanvas(
  workspace: AuthoringWorkspace,
  frameId: NodeId,
): void {
  const document = workspace.documentStore.getState();
  const node = document.nodes[frameId];
  if (!node || node.type !== 'frame') {
    return;
  }
  const frame = node as FrameNode;
  const canvas = document.canvases[frame.canvasId];
  if (!canvas) {
    return;
  }

  const resumeKey = surfaceResumeKey({
    documentId: document.documentId,
    graphId: canvas.graphId,
    canvasId: frame.canvasId,
  });
  if (resumeKey) {
    clearSurfaceResumeEntry(workspace.sessionStore, resumeKey);
  }

  const graphZoom = workspace.sessionStore.getState().viewport.zoom;
  requestViewportFit(workspace.sessionStore, frame.crop, graphZoom);
  workspace.focusCanvas(frame.canvasId);
  setCanvasFrameId(workspace.sessionStore, frameId);
  setActiveTool(workspace.sessionStore, 'select');
  setSelection(workspace.sessionStore, new Set());
}
