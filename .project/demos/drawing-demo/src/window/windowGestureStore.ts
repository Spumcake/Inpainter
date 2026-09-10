/**
 * Single source of truth for window gesture phase + content-busy exclusion.
 * Replaces canvasGestureLock. See docs/window-handling.md.
 */

export type WindowGesturePhase = 'idle' | 'nativeGesture' | 'recovering';
export type ContentBusy = 'none' | 'stroke' | 'scroll';

type WindowGestureState = {
  phase: WindowGesturePhase;
  contentBusy: ContentBusy;
};

let state: WindowGestureState = { phase: 'idle', contentBusy: 'none' };
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function setState(next: WindowGestureState) {
  if (next.phase === state.phase && next.contentBusy === state.contentBusy) return;
  state = next;
  notify();
}

export function getWindowGestureSnapshot(): WindowGestureState {
  return state;
}

export function subscribeWindowGesture(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function enterNativeGesture(): void {
  setState({ phase: 'nativeGesture', contentBusy: 'none' });
}

export function enterRecovering(): void {
  if (state.phase !== 'nativeGesture' && state.phase !== 'recovering') return;
  setState({ phase: 'recovering', contentBusy: 'none' });
}

export function clearRecovering(): void {
  if (state.phase !== 'recovering') return;
  setState({ phase: 'idle', contentBusy: state.contentBusy });
}

export function setContentBusy(busy: ContentBusy): void {
  if (busy === 'none') {
    const nextPhase = state.phase === 'recovering' ? 'idle' : state.phase;
    setState({ phase: nextPhase, contentBusy: 'none' });
    return;
  }
  if (state.phase === 'nativeGesture') return;
  setState({ ...state, contentBusy: busy });
}

/**
 * Scrollbars may start when not in an OS native gesture and no stroke is busy.
 * `recovering` is allowed — PE poison is a draw-engine concern, not a scrollbar lock.
 */
export function canScrollbarStartDrag(): boolean {
  return state.phase !== 'nativeGesture' && state.contentBusy !== 'stroke';
}

/**
 * Content pointer starts (stroke, pan) when not in a native OS gesture and
 * scrollbar is not dragging.
 */
export function canContentGestureStart(): boolean {
  return state.phase !== 'nativeGesture' && state.contentBusy !== 'scroll';
}

/** Alias — strokes use the same gate as other content gestures. */
export function canStrokeStart(): boolean {
  return canContentGestureStart();
}

/** Test helper — reset module state between tests. */
export function __resetWindowGestureStoreForTests(): void {
  state = { phase: 'idle', contentBusy: 'none' };
}
