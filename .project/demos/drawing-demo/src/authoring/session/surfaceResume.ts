import type { Draft } from 'immer';
import type { CanvasId, LayerId, NodeId } from '../ids';
import { listSketchesForCanvas } from '../nodes/listSketches';
import { nodeOnSurface } from '../document/nodeOnSurface';
import type {
  ActiveTool,
  DocumentState,
  SessionState,
  SurfaceResumeState,
  ViewFocus,
} from '../types';
import type { NodeRef } from '../types/nodes';
import type { SessionStore } from './sessionStore';

export function surfaceResumeKey(focus: ViewFocus): string | null {
  if (focus.canvasId != null) {
    return `canvas:${focus.canvasId}`;
  }
  if (focus.graphId != null) {
    return `graph:${focus.graphId}`;
  }
  return null;
}

export function captureSurfaceResume(session: SessionState): SurfaceResumeState {
  return {
    viewport: { ...session.viewport },
    activeTool: session.activeTool,
    selection: Array.from(session.selection, (ref) => ({ ...ref })),
    activeSketchId: session.activeSketchId,
    activeLayerId: session.activeLayerId,
    activePaletteId: session.activePaletteId,
    activeBrushId: session.activeBrushId,
    activeEraserId: session.activeEraserId,
    agentMode: session.agentMode,
    renderResultView: session.renderResultView,
  };
}

function isGraphFocus(focus: ViewFocus): boolean {
  return focus.canvasId == null && focus.graphId != null;
}

function filterSelection(
  refs: readonly NodeRef[],
  document: DocumentState,
  focus: ViewFocus,
): Set<NodeRef> {
  const next = new Set<NodeRef>();
  for (const ref of refs) {
    const node = document.nodes[ref.id];
    if (!node || node.type !== ref.type) {
      continue;
    }
    if (!nodeOnSurface(node, focus, document)) {
      continue;
    }
    next.add({ type: ref.type, id: ref.id });
  }
  return next;
}

function resolveActiveSketchId(
  document: DocumentState,
  canvasId: CanvasId,
  candidate: NodeId | null,
): NodeId | null {
  if (candidate) {
    const node = document.nodes[candidate];
    if (node?.type === 'sketch' && node.canvasId === canvasId) {
      return candidate;
    }
  }
  return null;
}

function resolveActiveLayerId(
  document: DocumentState,
  canvasId: CanvasId,
  candidate: LayerId | null,
): LayerId | null {
  const sketchData = document.sketches[canvasId];
  if (!sketchData || !candidate) {
    return null;
  }
  return sketchData.layers.some((layer) => layer.id === candidate)
    ? candidate
    : null;
}

function coerceToolForFocus(tool: ActiveTool, focus: ViewFocus): ActiveTool {
  if (isGraphFocus(focus) && tool !== 'select' && tool !== 'createFrame') {
    return 'select';
  }
  return tool;
}

function applyDefaultsToDraft(
  state: Draft<SessionState>,
  document: DocumentState,
  focus: ViewFocus,
): void {
  if (isGraphFocus(focus) || focus.canvasId == null) {
    state.activeTool = 'select';
    state.activeSketchId = null;
    state.activeLayerId = null;
    state.promptEditorOpen = false;
    state.agentMode = false;
    state.renderResultView = 'input';
    return;
  }

  const canvasId = focus.canvasId;
  const sketchData = document.sketches[canvasId];
  const firstLayer = sketchData?.layers[0];
  const sketches = listSketchesForCanvas(document, canvasId);
  state.activeTool = 'select';
  state.activeLayerId = firstLayer?.id ?? null;
  state.activeSketchId = sketches[0]?.id ?? null;
  state.promptEditorOpen = false;
  state.agentMode = false;
  state.renderResultView = 'input';
}

function applyResumeToDraft(
  state: Draft<SessionState>,
  document: DocumentState,
  snapshot: SurfaceResumeState,
  focus: ViewFocus,
): void {
  const selection = filterSelection(snapshot.selection, document, focus);
  const activeTool = coerceToolForFocus(snapshot.activeTool, focus);

  state.viewport = { ...snapshot.viewport };
  state.activeTool = activeTool;
  state.selection = selection;
  state.activePaletteId = snapshot.activePaletteId;
  state.activeBrushId = snapshot.activeBrushId;
  state.activeEraserId = snapshot.activeEraserId;
  state.promptEditorOpen = false;
  state.agentMode = snapshot.agentMode;
  state.renderResultView =
    snapshot.renderResultView === 'output' ? 'output' : 'input';

  if (isGraphFocus(focus) || focus.canvasId == null) {
    state.activeSketchId = null;
    state.activeLayerId = null;
    return;
  }

  const canvasId = focus.canvasId;
  state.activeSketchId = resolveActiveSketchId(
    document,
    canvasId,
    snapshot.activeSketchId,
  );
  state.activeLayerId = resolveActiveLayerId(
    document,
    canvasId,
    snapshot.activeLayerId,
  );
}

/** First-visit defaults (same intent as former syncCanvasDrawingTarget). */
export function applySurfaceDefaults(
  sessionStore: SessionStore,
  document: DocumentState,
  focus: ViewFocus,
): void {
  sessionStore.setState((state) => {
    applyDefaultsToDraft(state, document, focus);
  });
}

export function applySurfaceResume(
  sessionStore: SessionStore,
  document: DocumentState,
  snapshot: SurfaceResumeState | null,
  focus: ViewFocus,
): void {
  if (!snapshot) {
    applySurfaceDefaults(sessionStore, document, focus);
    return;
  }
  sessionStore.setState((state) => {
    applyResumeToDraft(state, document, snapshot, focus);
  });
}

/**
 * Single Session commit: set viewFocus and restore (or default) surface state.
 * Avoids the transient incoherent state from separate setViewFocus + applyResume.
 */
export function applyFocusTransition(
  sessionStore: SessionStore,
  document: DocumentState,
  next: ViewFocus,
  snapshot: SurfaceResumeState | null,
): void {
  sessionStore.setState((state) => {
    if (state.viewFocus.canvasId !== next.canvasId) {
      state.canvasFrameId = null;
      state.containerEditId = null;
    }
    state.viewFocus = next;
    if (!snapshot) {
      applyDefaultsToDraft(state, document, next);
      return;
    }
    applyResumeToDraft(state, document, snapshot, next);
  });
}

export function writeSurfaceResumeEntry(
  sessionStore: SessionStore,
  key: string,
  snapshot: SurfaceResumeState,
): void {
  sessionStore.setState((state) => {
    state.surfaceResume[key] = snapshot;
  });
}

/** Drop a surface resume entry so the next focus does not restore it. */
export function clearSurfaceResumeEntry(
  sessionStore: SessionStore,
  key: string,
): void {
  sessionStore.setState((state) => {
    delete state.surfaceResume[key];
  });
}
