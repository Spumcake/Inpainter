import { Images } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import type { NodeId } from '../../authoring/ids';
import {
  OUTPUT_ORANGE_TEXT_CLASS,
  OUTPUT_ORANGE_TRIGGER_ACTIVE_CLASS,
  resolveOutputInputToggleTarget,
  toggleFrameResultView,
  type OutputInputToggleTarget,
} from '../../authoring/nodes';
import type { AuthoringWorkspace } from '../../authoring/workspace';
import { CHROME_BLOCKED_BUTTON_CLASS } from '../../chrome';

export type InputOutputHeaderButtonProps = {
  workspace: AuthoringWorkspace;
  live: boolean;
};

type ToggleSnapshot = {
  frameId: NodeId | null;
  resultView: 'input' | 'output';
  hasResult: boolean;
};

const EMPTY_SNAPSHOT: ToggleSnapshot = {
  frameId: null,
  resultView: 'input',
  hasResult: false,
};

const snapshotCache = new WeakMap<AuthoringWorkspace, ToggleSnapshot>();

function readToggleSnapshot(workspace: AuthoringWorkspace): ToggleSnapshot {
  const session = workspace.sessionStore.getState();
  const target: OutputInputToggleTarget | null = resolveOutputInputToggleTarget({
    nodes: workspace.documentStore.getState().nodes,
    selection: session.selection,
    canvasFrameId: session.canvasFrameId,
  });
  const next: ToggleSnapshot = target
    ? {
        frameId: target.frameId,
        resultView: target.resultView,
        hasResult: target.hasResult,
      }
    : EMPTY_SNAPSHOT;

  const cached = snapshotCache.get(workspace);
  if (
    cached &&
    cached.frameId === next.frameId &&
    cached.resultView === next.resultView &&
    cached.hasResult === next.hasResult
  ) {
    return cached;
  }
  snapshotCache.set(workspace, next);
  return next;
}

/** Header output–input toggle for the focused Frame’s generation relationship. */
export function InputOutputHeaderButton({
  workspace,
  live,
}: InputOutputHeaderButtonProps) {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      const unsubDoc = workspace.documentStore.subscribe(onStoreChange);
      const unsubSession = workspace.sessionStore.subscribe(onStoreChange);
      return () => {
        unsubDoc();
        unsubSession();
      };
    },
    () => readToggleSnapshot(workspace),
    () => readToggleSnapshot(workspace),
  );

  const canToggle = live && snapshot.frameId != null && snapshot.hasResult;
  const outputActive = snapshot.resultView === 'output';

  const buttonClass = canToggle
    ? outputActive
      ? `cursor-pointer rounded-md p-1 ${OUTPUT_ORANGE_TEXT_CLASS} ${OUTPUT_ORANGE_TRIGGER_ACTIVE_CLASS}`
      : 'cursor-pointer rounded-md p-1 text-gray-600 hover:bg-gray-100 hover:text-gray-700'
    : CHROME_BLOCKED_BUTTON_CLASS;

  return (
    <button
      type="button"
      disabled={!canToggle}
      aria-pressed={outputActive}
      className={buttonClass}
      title={
        snapshot.frameId == null
          ? 'Select a Frame with a render result'
          : !snapshot.hasResult
            ? 'No render result for this Frame'
            : outputActive
              ? 'Show input'
              : 'Show output'
      }
      aria-label={
        !canToggle
          ? 'Output view unavailable'
          : outputActive
            ? 'Show input'
            : 'Show output'
      }
      onClick={() => {
        if (!canToggle || snapshot.frameId == null) return;
        workspace.runner.dispatch(toggleFrameResultView(snapshot.frameId));
      }}
    >
      <Images size={16} strokeWidth={2} />
    </button>
  );
}
