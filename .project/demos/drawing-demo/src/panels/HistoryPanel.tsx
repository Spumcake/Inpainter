import { useSyncExternalStore } from 'react';
import type { AuthoringWorkspace } from '../authoring/workspace';
import { GlobalPanel } from './GlobalPanel';
import { buildHistoryItems } from './historyItems';

type HistoryPanelProps = {
  workspace: AuthoringWorkspace;
  onClose: () => void;
};

/**
 * History panel reads the unified History store on the workspace.
 * With Indexer Document sync, that store is hydrated from
 * `GET /documents/{id}/history` and kept current via runner-owned remote merge.
 */
export function HistoryPanel({ workspace, onClose }: HistoryPanelProps) {
  const historyState = useSyncExternalStore(
    workspace.historyStore.subscribe,
    workspace.historyStore.getState,
    workspace.historyStore.getState,
  );

  const pointer = workspace.runner.getHistoryPointer();
  const items = buildHistoryItems(historyState.entries, pointer, (index) => {
    try {
      workspace.runner.jump(index);
      onClose();
    } catch (err) {
      console.error('[HistoryPanel] jump failed', err);
    }
  });

  return (
    <GlobalPanel
      ariaLabel="History"
      emptyLabel="No history"
      items={items}
      onClose={onClose}
    />
  );
}
