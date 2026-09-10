import type { Draft } from 'immer';
import { hasNodeFocus } from '../nodes/nodeFocus';
import { solePromptEditorEligibleRef } from '../nodes/promptEligibility';
import type { SessionState } from '../types';

function surfaceFromViewFocus(
  canvasId: SessionState['viewFocus']['canvasId'],
): 'graph' | 'canvas' {
  return canvasId != null ? 'canvas' : 'graph';
}

function canKeepPromptEditorOpen(state: SessionState): boolean {
  if (
    solePromptEditorEligibleRef(
      state.selection,
      surfaceFromViewFocus(state.viewFocus.canvasId),
    ) == null
  ) {
    return false;
  }
  return state.activeTool === 'select' || state.agentMode;
}

/**
 * Session flag invariants — runs after every SessionStore `setState`.
 * Mutators must not reimplement these rules.
 */
export function normalizeSessionState(state: Draft<SessionState>): void {
  if (state.agentMode && !hasNodeFocus(state.selection)) {
    state.agentMode = false;
  }

  if (state.agentMode && canKeepPromptEditorOpen(state)) {
    state.promptEditorOpen = true;
    return;
  }

  if (state.promptEditorOpen && !canKeepPromptEditorOpen(state)) {
    state.promptEditorOpen = false;
  }
}
