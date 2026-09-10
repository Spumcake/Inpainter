import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from '../tauri-env';

export type DesktopSessionPayload = {
  session_id: string;
  indexer_url: string | null;
};

/** Per-window view focus placeholders until Document Session sync lands. */
export type ViewFocusStub = {
  documentId: string | null;
  graphId: string | null;
  canvasId: string | null;
};

export const WORKSPACE_DATA_RESET_EVENT = 'workspace-data-reset';

export function createViewFocusStub(): ViewFocusStub {
  return {
    documentId: null,
    graphId: null,
    canvasId: null,
  };
}

export async function initDesktopSessionBridge(
  onSession: (session: DesktopSessionPayload | null) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    onSession(null);
    return () => {};
  }

  try {
    const snapshot = await invoke<DesktopSessionPayload | null>('get_desktop_session');
    onSession(snapshot);
  } catch (error) {
    console.warn('[desktop-session] get_desktop_session failed', error);
    onSession(null);
  }

  return listen<DesktopSessionPayload>('desktop-session', (event) => {
    onSession(event.payload);
  });
}

/** Tray Empty All Data → reboot local working copy to Launch. */
export async function listenWorkspaceDataReset(
  onReset: () => void | Promise<void>,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }
  return listen(WORKSPACE_DATA_RESET_EVENT, () => {
    void Promise.resolve(onReset()).catch((err) => {
      console.error('[desktop-session] workspace-data-reset handler failed', err);
    });
  });
}
