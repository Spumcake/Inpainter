import { Minus, Plus } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import {
  canDeleteCanvas,
  canDeleteGraph,
  createGraph,
  deleteCanvas,
  deleteGraph,
  getCanvasTitle,
  getDocumentTitle,
  getGraphTitle,
  renameDocument,
  renameGraph,
} from '../authoring/document';
import { firstCanvasIdForGraph, firstGraphId } from '../authoring/document';
import { createCanvasOnGraph } from '../authoring/sketch';
import type { CanvasId, GraphId } from '../authoring/ids';
import type { AuthoringWorkspace } from '../authoring/workspace';
import {
  CHROME_LIST_ITEM_ACTIVE,
  CHROME_LIST_ITEM_DEFAULT,
} from '../chrome';
import { InlineRenameLabel } from '../components/InlineRenameLabel';
import { GlobalPanel } from './GlobalPanel';

type WorkspacePanelProps = {
  workspace: AuthoringWorkspace;
  onClose: () => void;
};

type WorkspaceSnapshot = {
  documentId: string;
  viewFocus: {
    graphId: GraphId | null;
    canvasId: CanvasId | null;
  };
  graphOrderKey: string;
  canvasOrderKey: string;
};

const workspaceSnapshotCache = new WeakMap<
  AuthoringWorkspace,
  WorkspaceSnapshot
>();

function subscribeWorkspacePanel(
  workspace: AuthoringWorkspace,
  onStoreChange: () => void,
): () => void {
  const unsubDocument = workspace.documentStore.subscribe(onStoreChange);
  const unsubSession = workspace.sessionStore.subscribe(onStoreChange);
  return () => {
    unsubDocument();
    unsubSession();
  };
}

function getWorkspacePanelSnapshot(
  workspace: AuthoringWorkspace,
): WorkspaceSnapshot {
  const documentState = workspace.documentStore.getState();
  const sessionState = workspace.sessionStore.getState();
  const next: WorkspaceSnapshot = {
    documentId: documentState.documentId,
    viewFocus: {
      graphId: sessionState.viewFocus.graphId,
      canvasId: sessionState.viewFocus.canvasId,
    },
    graphOrderKey: documentState.graphOrder.join('\0'),
    canvasOrderKey: Object.entries(documentState.canvasOrderByGraph)
      .map(([graphId, order]) => `${graphId}:${order.join(',')}`)
      .join('\0'),
  };

  const cached = workspaceSnapshotCache.get(workspace);
  if (
    cached &&
    cached.documentId === next.documentId &&
    cached.viewFocus.graphId === next.viewFocus.graphId &&
    cached.viewFocus.canvasId === next.viewFocus.canvasId &&
    cached.graphOrderKey === next.graphOrderKey &&
    cached.canvasOrderKey === next.canvasOrderKey
  ) {
    return cached;
  }

  workspaceSnapshotCache.set(workspace, next);
  return next;
}

type ActionButtonProps = {
  title: string;
  icon: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function ActionButton({
  title,
  icon,
  danger,
  disabled,
  onClick,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={`shrink-0 rounded p-1 transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-25'
          : danger
            ? 'text-gray-600 hover:text-red-500'
            : 'text-gray-600 hover:bg-gray-50'
      }`}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) {
          onClick();
        }
      }}
    >
      {icon}
    </button>
  );
}

export function WorkspacePanel({ workspace, onClose }: WorkspacePanelProps) {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => subscribeWorkspacePanel(workspace, onStoreChange),
    () => getWorkspacePanelSnapshot(workspace),
    () => getWorkspacePanelSnapshot(workspace),
  );

  const documentState = workspace.documentStore.getState();
  const activeGraphId = snapshot.viewFocus.graphId;
  const activeCanvasId = snapshot.viewFocus.canvasId;

  const handleSelectGraph = (graphId: GraphId) => {
    workspace.focusGraph(graphId);
    onClose();
  };

  const handleSelectCanvas = (canvasId: CanvasId) => {
    workspace.focusCanvas(canvasId);
    onClose();
  };

  const handleCreateGraph = () => {
    workspace.runner.dispatch(createGraph());
  };

  const handleCreateCanvas = (graphId: GraphId) => {
    workspace.runner.dispatch(createCanvasOnGraph(graphId));
  };

  const handleDeleteGraph = (graphId: GraphId) => {
    workspace.runner.dispatch(deleteGraph(graphId));
    const nextState = workspace.documentStore.getState();
    const nextGraphId = firstGraphId(nextState);
    if (nextGraphId) {
      workspace.focusGraph(nextGraphId);
    }
  };

  const handleDeleteCanvas = (canvasId: CanvasId, graphId: GraphId) => {
    workspace.runner.dispatch(deleteCanvas(canvasId));
    if (activeCanvasId === canvasId) {
      const nextState = workspace.documentStore.getState();
      const nextCanvasId = firstCanvasIdForGraph(nextState, graphId);
      if (nextCanvasId) {
        workspace.focusCanvas(nextCanvasId);
      }
    }
  };

  const documentLabel = getDocumentTitle(documentState);

  return (
    <GlobalPanel ariaLabel="Workspace" onClose={onClose}>
      <ol>
        <li>
          <div className="flex items-center">
            <div className="flex min-w-0 flex-1 items-center px-3 py-1 text-xs font-medium text-gray-900">
              <InlineRenameLabel
                value={documentLabel}
                live
                title="Rename document"
                className="min-w-0 flex-1 truncate cursor-text rounded px-1 text-left transition-colors hover:bg-gray-100"
                onCommit={(title) => workspace.runner.dispatch(renameDocument(title))}
              />
            </div>
            <ActionButton
              title="New graph"
              icon={<Plus size={14} />}
              onClick={handleCreateGraph}
            />
          </div>
          {documentState.graphOrder.map((graphId) => {
            const graph = documentState.graphs[graphId];
            if (!graph) {
              return null;
            }

            const isActiveGraph = graphId === activeGraphId;
            const highlightGraph = isActiveGraph && !activeCanvasId;
            const graphDeletable = canDeleteGraph(documentState, graphId);
            const canvases = documentState.canvasOrderByGraph[graphId] ?? [];

            return (
              <div key={graphId}>
                <div className="flex items-center pl-4">
                  <button
                    type="button"
                    onClick={() => handleSelectGraph(graphId)}
                    className={`min-w-0 flex-1 truncate py-1 pl-3 pr-1 text-left text-xs transition-colors ${
                      highlightGraph
                        ? CHROME_LIST_ITEM_ACTIVE
                        : CHROME_LIST_ITEM_DEFAULT
                    }`}
                  >
                    <InlineRenameLabel
                      value={getGraphTitle(documentState, graphId)}
                      live
                      activateOn="doubleClick"
                      title="Double-click to rename graph"
                      className="block min-w-0 truncate"
                      inputClassName="w-full max-w-none rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs font-medium text-gray-800 outline-none focus:border-gray-400"
                      onCommit={(name) =>
                        workspace.runner.dispatch(renameGraph(graphId, name))
                      }
                    />
                  </button>
                  <ActionButton
                    title={
                      graphDeletable
                        ? 'Delete graph'
                        : 'Cannot delete the last graph'
                    }
                    icon={<Minus size={14} />}
                    danger
                    disabled={!graphDeletable}
                    onClick={() => handleDeleteGraph(graphId)}
                  />
                  <ActionButton
                    title="New canvas"
                    icon={<Plus size={14} />}
                    onClick={() => handleCreateCanvas(graphId)}
                  />
                </div>
                {canvases.map((canvasId) => {
                  const canvas = documentState.canvases[canvasId];
                  if (!canvas) {
                    return null;
                  }

                  const canvasDeletable = canDeleteCanvas(documentState, canvasId);

                  return (
                    <div key={canvasId} className="flex items-center pl-8">
                      <button
                        type="button"
                        onClick={() => handleSelectCanvas(canvasId)}
                        className={`min-w-0 flex-1 truncate py-1 pl-2 pr-1 text-left text-xs transition-colors ${
                          canvasId === activeCanvasId
                            ? CHROME_LIST_ITEM_ACTIVE
                            : CHROME_LIST_ITEM_DEFAULT
                        }`}
                      >
                        {getCanvasTitle(documentState, canvasId)}
                      </button>
                      <ActionButton
                        title="Delete canvas"
                        icon={<Minus size={14} />}
                        danger
                        disabled={!canvasDeletable}
                        onClick={() => handleDeleteCanvas(canvasId, graphId)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </li>
      </ol>
    </GlobalPanel>
  );
}
