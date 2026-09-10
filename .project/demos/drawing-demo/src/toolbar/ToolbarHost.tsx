import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { AuthoringWorkspace } from '../authoring/workspace';
import { isCanvasFrameOutputViewActive } from '../authoring/nodes/compatibleTools';
import { coerceGatedToolForCompatibility } from '../authoring/session/sessionStore';
import { deriveToolbarContext } from './deriveContext';
import { TOOL_REGISTRY } from './registry';
import { resolveToolbarStrip } from './resolveStrip';
import { ToolbarShell } from './ToolbarShell';

type ToolbarHostProps = {
  workspace: AuthoringWorkspace;
  toolbarLive?: boolean;
  showActiveTool?: boolean;
  stack?: 'authoring' | 'aboveListScrim';
  onPromptSubmit?: () => void;
  onOpenPromptCompiler?: () => void;
  promptCompilerOpen?: boolean;
};

function subscribeStores(
  workspace: AuthoringWorkspace,
  onStoreChange: () => void,
): () => void {
  const unsubSession = workspace.sessionStore.subscribe(onStoreChange);
  const unsubDocument = workspace.documentStore.subscribe(onStoreChange);
  return () => {
    unsubSession();
    unsubDocument();
  };
}

type HostSnapshot = {
  session: ReturnType<AuthoringWorkspace['sessionStore']['getState']>;
  document: ReturnType<AuthoringWorkspace['documentStore']['getState']>;
};

let hostSnapshotCache: HostSnapshot | null = null;

function getHostSnapshot(workspace: AuthoringWorkspace): HostSnapshot {
  const session = workspace.sessionStore.getState();
  const document = workspace.documentStore.getState();
  if (
    hostSnapshotCache &&
    hostSnapshotCache.session === session &&
    hostSnapshotCache.document === document
  ) {
    return hostSnapshotCache;
  }
  hostSnapshotCache = { session, document };
  return hostSnapshotCache;
}

export function ToolbarHost({
  workspace,
  toolbarLive = true,
  showActiveTool,
  stack = 'authoring',
  onPromptSubmit,
  onOpenPromptCompiler,
  promptCompilerOpen,
}: ToolbarHostProps) {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => subscribeStores(workspace, onStoreChange),
    () => getHostSnapshot(workspace),
    () => getHostSnapshot(workspace),
  );

  useEffect(() => {
    coerceGatedToolForCompatibility(workspace.sessionStore, {
      frameOutputViewActive: isCanvasFrameOutputViewActive({
        nodes: snapshot.document.nodes,
        canvasFrameId: snapshot.session.canvasFrameId,
      }),
    });
  }, [
    snapshot.document,
    snapshot.session.canvasFrameId,
    snapshot.session.activeTool,
    snapshot.session.selection,
    workspace.sessionStore,
  ]);

  const context = deriveToolbarContext(snapshot.session, snapshot.document);
  const strip = resolveToolbarStrip(context, TOOL_REGISTRY, workspace, {
    onPromptSubmit,
    onOpenPromptCompiler,
    promptCompilerOpen,
  });

  const handleActivateTool = useCallback(
    (toolId: string) => {
      if (!toolbarLive) {
        return;
      }
      const tool = TOOL_REGISTRY.find((entry) => entry.id === toolId);
      tool?.activate?.({ context, workspace });
    },
    [context, toolbarLive, workspace],
  );

  return (
    <ToolbarShell
      strip={strip}
      toolbarLive={toolbarLive}
      showActiveTool={showActiveTool}
      stack={stack}
      onActivateTool={handleActivateTool}
    />
  );
}
