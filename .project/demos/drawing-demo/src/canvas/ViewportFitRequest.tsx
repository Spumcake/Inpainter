import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { AuthoringWorkspace } from '../authoring/workspace';
import { clearViewportFitRequest } from '../authoring/session';
import { centerViewportOnRect, DEFAULT_ZOOM, useViewportShell } from './viewport';

type ViewportFitRequestProps = {
  workspace: AuthoringWorkspace;
};

/**
 * Applies Session `viewportFitRequest` (Frame Edit center) and clears it.
 * Works on first Canvas mount and when already focused on that Canvas.
 */
export function ViewportFitRequest({ workspace }: ViewportFitRequestProps) {
  const { containerRef, setViewportFree } = useViewportShell();
  const request = useSyncExternalStore(
    (onStoreChange) => workspace.sessionStore.subscribe(onStoreChange),
    () => workspace.sessionStore.getState().viewportFitRequest,
    () => workspace.sessionStore.getState().viewportFitRequest,
  );

  useLayoutEffect(() => {
    if (!request) {
      return;
    }
    const el = containerRef.current;
    if (!el || el.clientWidth <= 0 || el.clientHeight <= 0) {
      return;
    }
    setViewportFree(
      centerViewportOnRect(
        el.clientWidth,
        el.clientHeight,
        request.rect,
        request.zoom > 0 ? request.zoom : DEFAULT_ZOOM,
      ),
    );
    clearViewportFitRequest(workspace.sessionStore);
  }, [containerRef, request, setViewportFree, workspace.sessionStore]);

  return null;
}
