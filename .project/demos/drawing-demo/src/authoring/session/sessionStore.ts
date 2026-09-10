import { createAuthoringStore, type AuthoringStore } from '../store/createAuthoringStore';
import type { LayerId, NodeId } from '../ids';
import type {
  ActiveTool,
  PaintStaging,
  SessionState,
  ViewFocus,
  ViewportState,
} from '../types';
import {
  isToolGatedByNodeCompatibility,
  selectionAllowsTool,
} from '../nodes/compatibleTools';
import { hasNodeFocus } from '../nodes/nodeFocus';
import { solePromptEditorEligibleRef } from '../nodes/promptEligibility';
import { cloneSelectionSet } from '../nodes/selection';
import type { NodeRef, Rect } from '../types/nodes';
import { normalizeSessionState } from './normalizeSessionState';

export type SessionStore = AuthoringStore<SessionState>;

function surfaceFromViewFocus(
  canvasId: SessionState['viewFocus']['canvasId'],
): 'graph' | 'canvas' {
  return canvasId != null ? 'canvas' : 'graph';
}

const defaultViewFocus: ViewFocus = {
  documentId: null,
  graphId: null,
  canvasId: null,
};

export function createDefaultSessionState(
  overrides?: Partial<SessionState>,
): SessionState {
  return {
    viewFocus: { ...defaultViewFocus, ...overrides?.viewFocus },
    activeTool: overrides?.activeTool ?? 'select',
    selection: overrides?.selection ?? new Set<NodeRef>(),
    activePaletteId: overrides?.activePaletteId ?? null,
    activeBrushId: overrides?.activeBrushId ?? null,
    activeEraserId: overrides?.activeEraserId ?? null,
    paintStaging: overrides?.paintStaging ?? null,
    activeLayerId: overrides?.activeLayerId ?? null,
    activeSketchId: overrides?.activeSketchId ?? null,
    eraseHeld: overrides?.eraseHeld ?? false,
    eraseToggled: overrides?.eraseToggled ?? false,
    eyedropperTargetId: overrides?.eyedropperTargetId ?? null,
    openModal: overrides?.openModal ?? null,
    clipboard: overrides?.clipboard ?? null,
    viewport: overrides?.viewport ?? { panX: 0, panY: 0, zoom: 1 },
    surfaceResume: overrides?.surfaceResume ?? {},
    viewportFitRequest: overrides?.viewportFitRequest ?? null,
    promptEditorOpen: overrides?.promptEditorOpen ?? false,
    renderResultView: overrides?.renderResultView ?? 'input',
    canvasFrameId: overrides?.canvasFrameId ?? null,
    containerEditId: overrides?.containerEditId ?? null,
    agentMode: overrides?.agentMode ?? false,
    interactionBusy: overrides?.interactionBusy ?? false,
  };
}

export function createSessionStore(
  initial?: Partial<SessionState>,
): SessionStore {
  const seed = createDefaultSessionState(initial);
  return createAuthoringStore<SessionState>(() => seed, {
    normalize: normalizeSessionState,
  });
}

export function setViewFocus(store: SessionStore, focus: ViewFocus): void {
  store.setState((state) => {
    if (state.viewFocus.canvasId !== focus.canvasId) {
      state.canvasFrameId = null;
      state.containerEditId = null;
    }
    state.viewFocus = focus;
  });
}

export function setSelection(
  store: SessionStore,
  selection: Set<NodeRef>,
): void {
  store.setState((state) => {
    // Agent mode locks Node Focus — refuse selections that would drop it.
    if (state.agentMode && !hasNodeFocus(selection)) {
      return;
    }
    // Plain clones — never assign immer draft proxies into the Set.
    state.selection = cloneSelectionSet(selection);
    const refs = Array.from(state.selection);
    if (
      isToolGatedByNodeCompatibility(state.activeTool) &&
      !selectionAllowsTool(refs, state.activeTool)
    ) {
      state.activeTool = 'select';
      state.agentMode = false;
    }
  });
}

/**
 * Coerce latched paint/erase to Select when Node / presentation compatibility
 * no longer allows them (e.g. Canvas Frame output view). Same policy as
 * {@link setSelection}’s selection gate.
 */
export function coerceGatedToolForCompatibility(
  store: SessionStore,
  presentation?: Parameters<typeof selectionAllowsTool>[2],
): void {
  store.setState((state) => {
    const refs = Array.from(state.selection);
    if (
      isToolGatedByNodeCompatibility(state.activeTool) &&
      !selectionAllowsTool(refs, state.activeTool, presentation)
    ) {
      state.activeTool = 'select';
      state.agentMode = false;
    }
  });
}

export function setActiveLayerId(
  store: SessionStore,
  layerId: LayerId | null,
): void {
  store.setState((state) => {
    state.activeLayerId = layerId;
  });
}

export function setActiveSketchId(
  store: SessionStore,
  sketchId: NodeId | null,
): void {
  store.setState((state) => {
    state.activeSketchId = sketchId;
  });
}

export function setActivePaletteId(
  store: SessionStore,
  paletteId: string | null,
): void {
  store.setState((state) => {
    state.activePaletteId = paletteId;
  });
}

export function setActiveBrushId(
  store: SessionStore,
  brushId: string | null,
): void {
  store.setState((state) => {
    state.activeBrushId = brushId;
  });
}

export function setActiveEraserId(
  store: SessionStore,
  eraserId: string | null,
): void {
  store.setState((state) => {
    state.activeEraserId = eraserId;
  });
}

export function setActiveTool(store: SessionStore, tool: ActiveTool): void {
  store.setState((state) => {
    state.activeTool = tool;
    if (tool === 'select') {
      state.agentMode = false;
    }
  });
}

export function setAgentMode(store: SessionStore, on: boolean): void {
  store.setState((state) => {
    if (on && !hasNodeFocus(state.selection)) {
      state.agentMode = false;
      return;
    }
    state.agentMode = on;
    if (on) {
      openPromptEditorForAgent(state);
    } else {
      state.promptEditorOpen = false;
    }
  });
}

export function toggleAgentMode(store: SessionStore): void {
  store.setState((state) => {
    if (!hasNodeFocus(state.selection)) {
      state.agentMode = false;
      return;
    }
    const turningOn = !state.agentMode;
    state.agentMode = turningOn;
    if (turningOn) {
      openPromptEditorForAgent(state);
    } else {
      state.promptEditorOpen = false;
    }
  });
}

/** Entering Agent mode: latch Select + open Prompt Editor when eligible. */
function openPromptEditorForAgent(state: SessionState): void {
  if (
    solePromptEditorEligibleRef(
      state.selection,
      surfaceFromViewFocus(state.viewFocus.canvasId),
    ) == null
  ) {
    return;
  }
  // Same draft as agentMode — do not call setActiveTool (that clears agentMode).
  state.activeTool = 'select';
  state.promptEditorOpen = true;
}

export function setPromptEditorOpen(
  store: SessionStore,
  open: boolean,
): void {
  store.setState((state) => {
    if (
      open &&
      solePromptEditorEligibleRef(
        state.selection,
        surfaceFromViewFocus(state.viewFocus.canvasId),
      ) == null
    ) {
      state.promptEditorOpen = false;
      return;
    }
    if (open && state.activeTool !== 'select' && !state.agentMode) {
      state.promptEditorOpen = false;
      return;
    }
    state.promptEditorOpen = open;
  });
}

export function togglePromptEditorOpen(store: SessionStore): void {
  store.setState((state) => {
    if (state.promptEditorOpen) {
      state.promptEditorOpen = false;
      return;
    }
    if (
      solePromptEditorEligibleRef(
        state.selection,
        surfaceFromViewFocus(state.viewFocus.canvasId),
      ) == null
    ) {
      state.promptEditorOpen = false;
      return;
    }
    if (state.activeTool !== 'select' && !state.agentMode) {
      state.promptEditorOpen = false;
      return;
    }
    state.promptEditorOpen = true;
  });
}

export function setRenderResultView(
  store: SessionStore,
  view: 'input' | 'output',
): void {
  store.setState((state) => {
    state.renderResultView = view;
  });
}

export function toggleRenderResultView(store: SessionStore): void {
  store.setState((state) => {
    state.renderResultView =
      state.renderResultView === 'output' ? 'input' : 'output';
  });
}

/** Frame pill Edit: which Canvas Frame chrome to show (underlay + outside dim). */
export function setCanvasFrameId(
  store: SessionStore,
  frameId: NodeId | null,
): void {
  store.setState((state) => {
    state.canvasFrameId = frameId;
  });
}

export function setViewport(
  store: SessionStore,
  viewport: ViewportState,
): void {
  store.setState((state) => {
    state.viewport = viewport;
  });
}

let viewportFitToken = 0;

/**
 * Ask Canvas ViewportShell to center on `rect` at `zoom`
 * (overrides prior Canvas pan; preserves the given zoom).
 */
export function requestViewportFit(
  store: SessionStore,
  rect: Rect,
  zoom: number,
): void {
  viewportFitToken += 1;
  store.setState((state) => {
    state.viewportFitRequest = {
      rect: { ...rect },
      zoom,
      token: viewportFitToken,
    };
  });
}

export function clearViewportFitRequest(store: SessionStore): void {
  store.setState((state) => {
    state.viewportFitRequest = null;
  });
}

export function setPaintStaging(
  store: SessionStore,
  paintStaging: PaintStaging | null,
): void {
  store.setState((state) => {
    state.paintStaging = paintStaging;
  });
}

export function setPaintStagingActiveBrushId(
  store: SessionStore,
  brushId: string | null,
): void {
  store.setState((state) => {
    if (!state.paintStaging) return;
    state.paintStaging.activeBrushId = brushId;
  });
}

export function patchPaintStagingBrush(
  store: SessionStore,
  brushId: string,
  partial: Partial<Omit<NonNullable<PaintStaging['brushes'][number]>, 'id'>>,
): void {
  store.setState((state) => {
    if (!state.paintStaging) return;
    const index = state.paintStaging.brushes.findIndex(
      (slot) => slot != null && slot.id === brushId,
    );
    if (index < 0 || state.paintStaging.brushes[index] == null) return;
    state.paintStaging.brushes[index] = {
      ...state.paintStaging.brushes[index]!,
      ...partial,
    };
  });
}

export function reorderPaintStagingSlots(
  store: SessionStore,
  fromIndex: number,
  toIndex: number,
): void {
  store.setState((state) => {
    if (!state.paintStaging) return;
    const brushes = state.paintStaging.brushes;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= brushes.length ||
      toIndex >= brushes.length
    ) {
      return;
    }
    const [moved] = brushes.splice(fromIndex, 1);
    brushes.splice(toIndex, 0, moved ?? null);
  });
}

export function fillPaintStagingSlot(
  store: SessionStore,
  index: number,
  brush: NonNullable<PaintStaging['brushes'][number]>,
): void {
  store.setState((state) => {
    if (!state.paintStaging) return;
    const brushes = state.paintStaging.brushes;
    if (index < 0 || index >= brushes.length || brushes[index] != null) {
      return;
    }
    brushes[index] = brush;
    state.paintStaging.activeBrushId = brush.id;
  });
}

export function appendPaintStagingSlot(
  store: SessionStore,
  brush: NonNullable<PaintStaging['brushes'][number]>,
): void {
  store.setState((state) => {
    if (!state.paintStaging) return;
    state.paintStaging.brushes.push(brush);
    state.paintStaging.activeBrushId = brush.id;
  });
}

export function setInteractionBusy(store: SessionStore, busy: boolean): void {
  store.setState((state) => {
    state.interactionBusy = busy;
  });
}

export function enterContainerEdit(store: SessionStore, containerId: NodeId): void {
  store.setState((state) => {
    state.containerEditId = containerId;
    state.selection = new Set();
    state.activeTool = 'select';
    state.agentMode = false;
  });
}

export function exitContainerEdit(store: SessionStore, containerId: NodeId): void {
  store.setState((state) => {
    state.containerEditId = null;
    state.selection = new Set([{ type: 'container', id: containerId }]);
    state.activeTool = 'select';
  });
}

/** @deprecated Use enterContainerEdit */
export const enterGroupEdit = enterContainerEdit;

/** @deprecated Use exitContainerEdit */
export const exitGroupEdit = exitContainerEdit;
