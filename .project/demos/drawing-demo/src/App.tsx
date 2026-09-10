import { lazy, Suspense, useCallback, useEffect, useSyncExternalStore, useState } from 'react';
import { createAuthoringWorkspace } from './authoring/workspace';
import {
  getCanvasTitle,
  getDocumentTitle,
  getGraphTitle,
  renameDocument,
  renameGraph,
} from './authoring/document';
import { ensureOutputForOwner, hasNodeFocus } from './authoring/nodes';
import { toggleAgentMode } from './authoring/session';
import { isNodeFocusType } from './authoring/nodes/nodeFocus';
import type { ActiveTool } from './authoring/types';
import { CanvasHost, GraphHost } from './canvas';
import { AuthoringContextMenuHost } from './canvas/AuthoringContextMenu';
import { closeAuthoringContextMenu } from './canvas/authoringContextMenuStore';
import { dispatchContextMenuAction } from './canvas/dispatchContextMenuAction';
import { SelectionMetadataPill } from './canvas/SelectionMetadataPill';
import { matchShortcutAction, matchStructuralShortcutAction } from './settings/resolveShortcutPreferences';
import { ToolbarHost } from './toolbar';
import {
  closeChrome,
  deriveChromeAccess,
  openGlobalPanel,
  openMenu,
  openSettings,
  openToolConfig,
  type ChromeMode,
} from './chrome';
import { AgentHeaderButton, bindGenerationWorkspace } from './agent';
import { InputOutputHeaderButton } from './toolbar/prompt/InputOutputHeaderButton';
import {
  AgentPanel,
  HistoryPanel,
  OutlinerPanel,
  PromptCompilerPanel,
  ToolConfigModal,
  WorkspacePanel,
} from './panels';
import { AppHeader, type MainMenuAction } from './app-header';
import { SettingsErrorBoundary } from './settings/SettingsErrorBoundary';
import { isSettingsCatalogId } from './settings/catalogIds';
import type { CatalogId } from './settings/types';
import {
  initDesktopSessionBridge,
  listenWorkspaceDataReset,
  type DesktopSessionPayload,
} from './session/desktopSessionBridge';
import { connectIndexerDocumentEvents } from './session/indexerEventsBridge';
import { spawnDesktopWindow } from './session/desktopWindowBridge';
import { isTauri } from './tauri-env';
import { TimelineHost } from './timeline';
import { WindowChrome, closeWindow } from './window';
import { initStylusPressureBridge } from './window/stylusPressureBridge';

// Lazy so desktop boot does not pull settings catalogs / stores into the main bundle path.
const SettingsHost = lazy(() =>
  import('./settings/SettingsHost').then((mod) => {
    if (typeof mod.SettingsHost !== 'function') {
      throw new Error('SettingsHost export missing from settings chunk');
    }
    return { default: mod.SettingsHost };
  }),
);

const AssetLibraryHost = lazy(() =>
  import('./settings/asset-library/AssetLibraryHost').then((mod) => {
    if (typeof mod.AssetLibraryHost !== 'function') {
      throw new Error('AssetLibraryHost export missing from asset-library chunk');
    }
    return { default: mod.AssetLibraryHost };
  }),
);

const PalettesHost = lazy(() =>
  import('./settings/palettes-host/PalettesHost').then((mod) => {
    if (typeof mod.PalettesHost !== 'function') {
      throw new Error('PalettesHost export missing from palettes-host chunk');
    }
    return { default: mod.PalettesHost };
  }),
);

const ErasersHost = lazy(() =>
  import('./settings/erasers-host/ErasersHost').then((mod) => {
    if (typeof mod.ErasersHost !== 'function') {
      throw new Error('ErasersHost export missing from erasers-host chunk');
    }
    return { default: mod.ErasersHost };
  }),
);

const ProviderServersHost = lazy(() =>
  import('./settings/provider-servers/ProviderServersHost').then((mod) => {
    if (typeof mod.ProviderServersHost !== 'function') {
      throw new Error('ProviderServersHost export missing from provider-servers chunk');
    }
    return { default: mod.ProviderServersHost };
  }),
);

const authoringWorkspace = createAuthoringWorkspace();
bindGenerationWorkspace(authoringWorkspace);

function subscribeViewFocus(onStoreChange: () => void): () => void {
  return authoringWorkspace.sessionStore.subscribe(onStoreChange);
}

function getViewFocusSnapshot() {
  return authoringWorkspace.sessionStore.getState().viewFocus;
}

function getActiveToolSnapshot(): ActiveTool {
  return authoringWorkspace.sessionStore.getState().activeTool;
}

function getAgentModeSnapshot(): boolean {
  return authoringWorkspace.sessionStore.getState().agentMode;
}

function getNodeFocusSnapshot(): boolean {
  return hasNodeFocus(authoringWorkspace.sessionStore.getState().selection);
}

type HistorySnapshot = {
  canUndo: boolean;
  canRedo: boolean;
};

let historySnapshotCache: HistorySnapshot = {
  canUndo: false,
  canRedo: false,
};

function subscribeHistory(onStoreChange: () => void): () => void {
  return authoringWorkspace.sessionStore.subscribe(onStoreChange);
}

function getHistorySnapshot(): HistorySnapshot {
  const canUndo = authoringWorkspace.runner.canUndo();
  const canRedo = authoringWorkspace.runner.canRedo();
  if (
    historySnapshotCache.canUndo === canUndo &&
    historySnapshotCache.canRedo === canRedo
  ) {
    return historySnapshotCache;
  }

  historySnapshotCache = { canUndo, canRedo };
  return historySnapshotCache;
}

function subscribeDocumentLabels(onStoreChange: () => void): () => void {
  const unsubDocument = authoringWorkspace.documentStore.subscribe(onStoreChange);
  const unsubSession = authoringWorkspace.sessionStore.subscribe(onStoreChange);
  return () => {
    unsubDocument();
    unsubSession();
  };
}

function getDocumentTitleSnapshot(): string {
  return getDocumentTitle(authoringWorkspace.documentStore.getState());
}

function getGraphTitleSnapshot(): string {
  const documentState = authoringWorkspace.documentStore.getState();
  const graphId = authoringWorkspace.sessionStore.getState().viewFocus.graphId;
  return getGraphTitle(documentState, graphId);
}

function getCanvasTitleSnapshot(): string | null {
  const canvasId = authoringWorkspace.sessionStore.getState().viewFocus.canvasId;
  if (canvasId == null) {
    return null;
  }
  return getCanvasTitle(authoringWorkspace.documentStore.getState(), canvasId);
}

export default function App() {
  const [chromeMode, setChromeMode] = useState<ChromeMode>({ kind: 'idle' });
  const [desktopSession, setDesktopSession] = useState<DesktopSessionPayload | null>(null);
  const [sessionBridgeReady, setSessionBridgeReady] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const appReady = sessionBridgeReady && workspaceReady;
  const chromeAccess = deriveChromeAccess(chromeMode);
  const viewFocus = useSyncExternalStore(
    subscribeViewFocus,
    getViewFocusSnapshot,
    getViewFocusSnapshot,
  );
  const activeTool = useSyncExternalStore(
    subscribeViewFocus,
    getActiveToolSnapshot,
    getActiveToolSnapshot,
  );
  const agentMode = useSyncExternalStore(
    subscribeViewFocus,
    getAgentModeSnapshot,
    getAgentModeSnapshot,
  );
  const nodeFocus = useSyncExternalStore(
    subscribeViewFocus,
    getNodeFocusSnapshot,
    getNodeFocusSnapshot,
  );
  const historyState = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistorySnapshot,
  );
  const documentTitle = useSyncExternalStore(
    subscribeDocumentLabels,
    getDocumentTitleSnapshot,
    getDocumentTitleSnapshot,
  );
  const graphTitle = useSyncExternalStore(
    subscribeDocumentLabels,
    getGraphTitleSnapshot,
    getGraphTitleSnapshot,
  );
  const canvasTitle = useSyncExternalStore(
    subscribeDocumentLabels,
    getCanvasTitleSnapshot,
    getCanvasTitleSnapshot,
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void initDesktopSessionBridge((session) => {
      setDesktopSession(session);
      setSessionBridgeReady(true);
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void initStylusPressureBridge().then((dispose) => {
      unlisten = dispose;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!sessionBridgeReady) return;

    const indexerUrl = desktopSession?.indexer_url ?? null;
    let disposeEvents: (() => void) | undefined;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let wakeRetry: (() => void) | null = null;
    setWorkspaceReady(false);

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        wakeRetry = resolve;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          wakeRetry = null;
          resolve();
        }, ms);
      });

    const boot = async () => {
      while (!cancelled) {
        try {
          await authoringWorkspace.ensureBooted(indexerUrl);
          if (cancelled) return;

          disposeEvents?.();
          disposeEvents = undefined;
          const sync = authoringWorkspace.getDocumentSync?.() ?? null;
          if (sync && indexerUrl) {
            const handle = connectIndexerDocumentEvents(() => indexerUrl, sync);
            disposeEvents = () => handle.dispose();
          }
          setWorkspaceReady(true);
          return;
        } catch (err) {
          console.error('[desktop-boot] ensureBooted failed', err);
          if (cancelled) return;
          if (!indexerUrl) {
            // Local-only boot should not throw; if it does, stay gated.
            return;
          }
          await sleep(1500);
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      wakeRetry?.();
      wakeRetry = null;
      disposeEvents?.();
    };
  }, [sessionBridgeReady, desktopSession?.indexer_url]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let wakeRetry: (() => void) | null = null;
    let unlisten: (() => void) | undefined;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        wakeRetry = resolve;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          wakeRetry = null;
          resolve();
        }, ms);
      });

    void listenWorkspaceDataReset(async () => {
      setWorkspaceReady(false);
      while (!cancelled) {
        try {
          await authoringWorkspace.bootLocalDocument();
          await authoringWorkspace.ensureBooted(desktopSession?.indexer_url ?? null);
          if (cancelled) return;
          setWorkspaceReady(true);
          return;
        } catch (err) {
          console.error('[desktop-boot] workspace-data-reset boot failed', err);
          if (cancelled) return;
          await sleep(1500);
        }
      }
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      wakeRetry?.();
      unlisten?.();
    };
  }, [desktopSession?.indexer_url]);

  useEffect(() => {
    if (!import.meta.env.DEV || !desktopSession) return;
    console.info('[desktop-session]', desktopSession.session_id, viewFocus);
  }, [desktopSession, viewFocus]);

  const closeChromeMode = useCallback(() => {
    setChromeMode(closeChrome());
  }, []);

  const toggleMenu = useCallback(() => {
    setChromeMode((mode) => openMenu(mode));
  }, []);

  const toggleSettings = useCallback((catalogId: CatalogId, initialSectionId?: string) => {
    setChromeMode((mode) => openSettings(mode, { catalogId, initialSectionId }));
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggleSettings('debug-kitchen-sink');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSettings]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!chromeAccess.canvasLive) return;
      const session = authoringWorkspace.sessionStore.getState();
      if (session.activeTool !== 'select' || session.agentMode) return;
      if (isEditableTarget(event.target)) return;

      const action = matchShortcutAction(event);
      const structural = matchStructuralShortcutAction(event);
      const resolved = action ?? structural;
      if (!resolved) return;

      event.preventDefault();
      const kind = session.selection.size === 0 ? 'surface' : 'node';
      dispatchContextMenuAction(authoringWorkspace, resolved, kind);
      closeAuthoringContextMenu();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chromeAccess.canvasLive]);

  useEffect(() => {
    if (!chromeAccess.canvasLive) {
      closeAuthoringContextMenu();
    }
  }, [chromeAccess.canvasLive]);

  const handleUndo = useCallback(() => {
    if (!chromeAccess.headerAuthoringLive) return;
    authoringWorkspace.runner.undo();
  }, [chromeAccess.headerAuthoringLive]);

  const handleRedo = useCallback(() => {
    if (!chromeAccess.headerAuthoringLive) return;
    authoringWorkspace.runner.redo();
  }, [chromeAccess.headerAuthoringLive]);

  const handleMainMenuAction = useCallback(
    (action: MainMenuAction) => {
      switch (action) {
        case 'quit':
          if (isTauri()) {
            closeWindow();
          }
          return;
        case 'preferences':
          toggleSettings('document-preferences');
          return;
        case 'defaults':
          toggleSettings('defaults');
          return;
        case 'provider-server':
          toggleSettings('provider-servers');
          return;
        case 'asset-library':
          toggleSettings('asset-library');
          return;
        case 'new-window':
          setChromeMode(closeChrome());
          void spawnDesktopWindow();
          return;
        case 'new-document':
          setChromeMode(closeChrome());
          void authoringWorkspace.newDocument();
          return;
        case 'save-changes':
          setChromeMode(closeChrome());
          void authoringWorkspace.saveDocument();
          return;
      }
    },
    [toggleSettings],
  );

  const openHistoryPanel = useCallback(() => {
    setChromeMode((mode) => openGlobalPanel(mode, 'history'));
  }, []);

  const openWorkspacePanel = useCallback(() => {
    setChromeMode((mode) => openGlobalPanel(mode, 'workspace'));
  }, []);

  const openAgentPanel = useCallback(() => {
    setChromeMode((mode) => openGlobalPanel(mode, 'agent'));
  }, []);

  const handleAgentHeaderClick = useCallback(() => {
    const session = authoringWorkspace.sessionStore.getState();
    if (hasNodeFocus(session.selection)) {
      const turningOn = !session.agentMode;
      if (turningOn) {
        for (const ref of session.selection) {
          if (isNodeFocusType(ref.type)) {
            authoringWorkspace.runner.dispatch(ensureOutputForOwner(ref.id));
          }
        }
      }
      toggleAgentMode(authoringWorkspace.sessionStore);
      return;
    }
    openAgentPanel();
  }, [openAgentPanel]);

  const openToolConfigPanel = useCallback(() => {
    setChromeMode((mode) => openToolConfig(mode));
  }, []);

  const openPromptCompilerPanel = useCallback(() => {
    setChromeMode((mode) => openGlobalPanel(mode, 'promptCompiler'));
  }, []);

  const openOutlinerPanel = useCallback(() => {
    setChromeMode((mode) => openGlobalPanel(mode, 'outliner'));
  }, []);

  const openEraserLibrary = useCallback(() => {
    setChromeMode(
      openSettings(closeChrome(), {
        catalogId: 'erasers',
      }),
    );
  }, []);

  const openPaletteLibrary = useCallback(() => {
    setChromeMode(
      openSettings(closeChrome(), {
        catalogId: 'palettes',
      }),
    );
  }, []);

  const handleRenameDocument = useCallback(
    (title: string) => {
      if (!chromeAccess.headerAuthoringLive) return;
      authoringWorkspace.runner.dispatch(renameDocument(title));
    },
    [chromeAccess.headerAuthoringLive],
  );

  const handleRenameGraph = useCallback(
    (name: string) => {
      if (!chromeAccess.headerAuthoringLive) return;
      const focus = authoringWorkspace.sessionStore.getState().viewFocus;
      if (focus.canvasId != null) return;
      const graphId = focus.graphId;
      if (!graphId) return;
      authoringWorkspace.runner.dispatch(renameGraph(graphId, name));
    },
    [chromeAccess.headerAuthoringLive],
  );

  const handleFocusGraph = useCallback(() => {
    if (!chromeAccess.headerAuthoringLive) return;
    const graphId = authoringWorkspace.sessionStore.getState().viewFocus.graphId;
    if (!graphId) return;
    authoringWorkspace.focusGraph(graphId);
  }, [chromeAccess.headerAuthoringLive]);

  const settingsMode = chromeMode.kind === 'settings' ? chromeMode : null;
  const globalPanelId =
    chromeMode.kind === 'globalPanel' ? chromeMode.id : null;
  const toolConfigOpen = chromeMode.kind === 'toolConfig';
  const promptCompilerOpen = globalPanelId === 'promptCompiler';
  const agentActive = globalPanelId === 'agent';
  const agentLive = chromeAccess.headerAuthoringLive || agentActive;

  useEffect(() => {
    if (
      chromeMode.kind === 'toolConfig' &&
      activeTool !== 'paint' &&
      activeTool !== 'erase' &&
      activeTool !== 'select'
    ) {
      setChromeMode(closeChrome());
    }
  }, [chromeMode, activeTool]);

  if (!appReady) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden font-sans text-sm">
        <WindowChrome />
        <div
          className="relative flex flex-1 items-center justify-center bg-black"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Loading session"
        >
          <span
            aria-hidden
            className="agent-activity-spinner"
            style={{
              display: 'block',
              width: 28,
              height: 28,
              minWidth: 28,
              minHeight: 28,
              borderRadius: 9999,
              border: '2.5px solid rgba(255,255,255,0.25)',
              borderTopColor: '#ffffff',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden font-sans text-sm">
      <WindowChrome />
      <AppHeader
        chromeAccess={chromeAccess}
        menuOpen={chromeMode.kind === 'menu'}
        onMenuToggle={toggleMenu}
        onMenuClose={closeChromeMode}
        onOpenAbout={() => toggleSettings('about')}
        onMainMenuAction={handleMainMenuAction}
        canUndo={historyState.canUndo}
        canRedo={historyState.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenHistory={openHistoryPanel}
        onOpenWorkspace={openWorkspacePanel}
        onOpenToolConfig={openToolConfigPanel}
        ioControl={
          <InputOutputHeaderButton
            workspace={authoringWorkspace}
            live={chromeAccess.headerAuthoringLive}
          />
        }
        agentControl={
          <AgentHeaderButton
            workspace={authoringWorkspace}
            live={agentLive}
            active={agentActive}
            agentMode={agentMode}
            canToggle={nodeFocus}
            onClick={handleAgentHeaderClick}
          />
        }
        activeTool={activeTool}
        documentTitle={documentTitle}
        graphTitle={graphTitle}
        canvasTitle={canvasTitle}
        surface={viewFocus.canvasId != null ? 'canvas' : 'graph'}
        onRenameDocument={handleRenameDocument}
        onRenameGraph={handleRenameGraph}
        onFocusGraph={handleFocusGraph}
      />
      <SelectionMetadataPill
        workspace={authoringWorkspace}
        canvasLive={chromeAccess.canvasLive}
      />
      <AuthoringContextMenuHost workspace={authoringWorkspace} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 bg-black">
          {viewFocus.canvasId == null && viewFocus.graphId != null ? (
            <GraphHost
              workspace={authoringWorkspace}
              canvasLive={chromeAccess.canvasLive}
            />
          ) : (
            <CanvasHost workspace={authoringWorkspace} canvasLive={chromeAccess.canvasLive} />
          )}
          {/* Under settings (z-40). Global Panel / Tool Config mount at app root above the scrim. */}
          {!globalPanelId && !toolConfigOpen ? (
            <ToolbarHost
              workspace={authoringWorkspace}
              toolbarLive={chromeAccess.toolbarLive}
              showActiveTool={chromeAccess.toolbarShowActiveTool}
              onOpenPromptCompiler={openPromptCompilerPanel}
              promptCompilerOpen={promptCompilerOpen}
            />
          ) : null}
          {/* Above Global Panel / Tool Config scrim (z-40), below header (z-50).
              Stays inside the canvas region so it never overlays the timeline. */}
          {globalPanelId || toolConfigOpen ? (
            <ToolbarHost
              workspace={authoringWorkspace}
              toolbarLive={chromeAccess.toolbarLive}
              showActiveTool={chromeAccess.toolbarShowActiveTool}
              stack="aboveListScrim"
              onOpenPromptCompiler={openPromptCompilerPanel}
              promptCompilerOpen={promptCompilerOpen}
            />
          ) : null}
        </div>
        <TimelineHost workspace={authoringWorkspace} />
      </div>
      {/* Settings + Global Panels + Tool Config mount at app root so pt-12 matches window-top offset. */}
      {settingsMode ? (
        <div className="absolute inset-0 z-40">
          <SettingsErrorBoundary
            key={settingsMode.catalogId}
            onClose={closeChromeMode}
          >
            <Suspense fallback={null}>
              {settingsMode.catalogId === 'asset-library' ? (
                <AssetLibraryHost onClose={closeChromeMode} />
              ) : settingsMode.catalogId === 'palettes' ? (
                <PalettesHost
                  workspace={authoringWorkspace}
                  onClose={closeChromeMode}
                />
              ) : settingsMode.catalogId === 'erasers' ? (
                <ErasersHost onClose={closeChromeMode} />
              ) : settingsMode.catalogId === 'provider-servers' ? (
                <ProviderServersHost onClose={closeChromeMode} />
              ) : isSettingsCatalogId(settingsMode.catalogId) ? (
                <SettingsHost
                  catalogId={settingsMode.catalogId}
                  initialSectionId={settingsMode.initialSectionId}
                  onClose={closeChromeMode}
                />
              ) : null}
            </Suspense>
          </SettingsErrorBoundary>
        </div>
      ) : null}
      {globalPanelId ? (
        <div className="absolute inset-0 z-40">
          {globalPanelId === 'history' ? (
            <HistoryPanel workspace={authoringWorkspace} onClose={closeChromeMode} />
          ) : null}
          {globalPanelId === 'workspace' ? (
            <WorkspacePanel workspace={authoringWorkspace} onClose={closeChromeMode} />
          ) : null}
          {globalPanelId === 'agent' ? (
            <AgentPanel onClose={closeChromeMode} />
          ) : null}
          {globalPanelId === 'outliner' ? (
            <OutlinerPanel
              workspace={authoringWorkspace}
              onClose={closeChromeMode}
            />
          ) : null}
          {globalPanelId === 'promptCompiler' ? (
            <PromptCompilerPanel onClose={closeChromeMode} />
          ) : null}
        </div>
      ) : null}
      {toolConfigOpen ? (
        <div className="absolute inset-0 z-40">
          <ToolConfigModal
            workspace={authoringWorkspace}
            onClose={closeChromeMode}
            onOpenPaletteLibrary={openPaletteLibrary}
            onOpenEraserLibrary={openEraserLibrary}
            onOpenOutliner={openOutlinerPanel}
          />
        </div>
      ) : null}
    </div>
  );
}
