import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../tauri-env';
import { hitBandAt } from './hitBands';
import { startResize } from './nativeWindow';
import {
  clearRecovering,
  enterNativeGesture,
  enterRecovering,
  getWindowGestureSnapshot,
} from './windowGestureStore';

const NATIVE_END_DEBOUNCE_MS = 120;

function isInteractiveControl(target: Element): boolean {
  return Boolean(
    target.closest(
      'button, input, textarea, select, a, [data-no-window-drag], [role="button"]',
    ),
  );
}

function isHeaderDragSurface(target: Element): boolean {
  return Boolean(target.closest('[data-tauri-drag-region]'));
}

type PressPoint = {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
};

/**
 * Shared start path for pointerdown and mouse fallback (WebKitGTK PE poison).
 * Resize: JS startResize (edge strips + hit-band).
 * Move: header `data-tauri-drag-region` owns OS drag — router only enters phase.
 * Do not preventDefault/stopPropagation on move (that breaks the drag-region).
 */
function tryStartNativeFromPress(event: PressPoint): boolean {
  if (getWindowGestureSnapshot().phase === 'nativeGesture') {
    enterRecovering();
  }

  const { innerWidth: w, innerHeight: h } = window;
  const band = hitBandAt(event.clientX, event.clientY, w, h);

  if (band.kind === 'resize') {
    event.preventDefault();
    event.stopPropagation();
    enterNativeGesture();
    startResize(band.direction);
    return true;
  }

  if (getWindowGestureSnapshot().phase === 'recovering') {
    clearRecovering();
  }

  if (
    event.target instanceof Element &&
    !isInteractiveControl(event.target) &&
    (band.kind === 'dragHeader' || isHeaderDragSurface(event.target))
  ) {
    // Phase only — OS move comes from data-tauri-drag-region on the header.
    enterNativeGesture();
    return true;
  }

  return false;
}

/**
 * Sole capture-phase owner of OS resize start + native end → recovering.
 * Header move is owned by `data-tauri-drag-region` (WebKitGTK-reliable);
 * North/West/East/South resize cursors + startResize stay on WindowEdgeLayer + this router.
 *
 * Mouse fallback: after native move/resize, WebKitGTK may omit the next
 * `pointerdown` while `mousedown` still fires — same poison as the draw engine.
 */
export function useWindowGestureRouter(): void {
  useEffect(() => {
    if (!isTauri()) return;

    let endDebounce: ReturnType<typeof setTimeout> | null = null;
    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;
    /** True when pointerdown already handled this press (skip paired mousedown start). */
    let pointerOwnedThisPress = false;

    const clearEndDebounce = () => {
      if (endDebounce != null) {
        clearTimeout(endDebounce);
        endDebounce = null;
      }
    };

    const scheduleRecoveringFromNative = () => {
      if (getWindowGestureSnapshot().phase !== 'nativeGesture') return;
      clearEndDebounce();
      endDebounce = setTimeout(() => {
        endDebounce = null;
        if (getWindowGestureSnapshot().phase === 'nativeGesture') {
          enterRecovering();
        }
      }, NATIVE_END_DEBOUNCE_MS);
    };

    const endNativeIfNeeded = () => {
      clearEndDebounce();
      pointerOwnedThisPress = false;
      if (getWindowGestureSnapshot().phase === 'nativeGesture') {
        enterRecovering();
      }
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!(event.target instanceof Element)) return;

      pointerOwnedThisPress = true;
      tryStartNativeFromPress(event);
    };

    const onMouseDownCapture = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (!(event.target instanceof Element)) return;

      // Pointer path already ran for this press — do not double-enter phase.
      // Must not stopPropagation: drag-region needs the bubbling mousedown.
      if (pointerOwnedThisPress) {
        pointerOwnedThisPress = false;
        return;
      }

      tryStartNativeFromPress(event);
    };

    const onPointerUp = () => endNativeIfNeeded();
    const onPointerCancel = () => endNativeIfNeeded();
    const onMouseUp = () => endNativeIfNeeded();
    const onBlur = () => endNativeIfNeeded();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') endNativeIfNeeded();
    };

    window.addEventListener('pointerdown', onPointerDownCapture, true);
    window.addEventListener('mousedown', onMouseDownCapture, true);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    const win = getCurrentWindow();
    void win.onMoved(() => {
      scheduleRecoveringFromNative();
    }).then((unlisten) => {
      unlistenMoved = unlisten;
    });
    void win.onResized(() => {
      scheduleRecoveringFromNative();
    }).then((unlisten) => {
      unlistenResized = unlisten;
    });

    return () => {
      clearEndDebounce();
      window.removeEventListener('pointerdown', onPointerDownCapture, true);
      window.removeEventListener('mousedown', onMouseDownCapture, true);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, []);
}
