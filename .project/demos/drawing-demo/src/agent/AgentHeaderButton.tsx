import { useSyncExternalStore } from 'react';
import {
  OUTPUT_ORANGE_ACCENT,
  resolveOutputInputToggleTarget,
} from '../authoring/nodes';
import type { AuthoringWorkspace } from '../authoring/workspace';
import { CHROME_BLOCKED_BUTTON_CLASS, chromeTriggerClass } from '../chrome';
import {
  getAgentActivityPhase,
  subscribeAgentActivity,
} from './agentActivity';

export type AgentHeaderButtonProps = {
  workspace: AuthoringWorkspace;
  live: boolean;
  /** Activity Global Panel open. */
  active: boolean;
  /** Session Agent mode on — invert colors (white on black). */
  agentMode?: boolean;
  /** Node Focus — click toggles Agent mode; show border as toggle affordance. */
  canToggle?: boolean;
  onClick: () => void;
};

type ResultFocusSnapshot = {
  hasResult: boolean;
};

const resultFocusCache = new WeakMap<AuthoringWorkspace, ResultFocusSnapshot>();

function readResultFocusSnapshot(
  workspace: AuthoringWorkspace,
): ResultFocusSnapshot {
  const session = workspace.sessionStore.getState();
  const target = resolveOutputInputToggleTarget({
    nodes: workspace.documentStore.getState().nodes,
    selection: session.selection,
    canvasFrameId: session.canvasFrameId,
  });
  const next: ResultFocusSnapshot = {
    hasResult: Boolean(target?.hasResult),
  };
  const cached = resultFocusCache.get(workspace);
  if (cached && cached.hasResult === next.hasResult) {
    return cached;
  }
  resultFocusCache.set(workspace, next);
  return next;
}

/**
 * Header Agent trigger. Lives in `agent/` so activity / finished state can
 * drive the control without baking Agent concerns into AppHeader.
 */
export function AgentHeaderButton({
  workspace,
  live,
  active,
  agentMode = false,
  canToggle = false,
  onClick,
}: AgentHeaderButtonProps) {
  const phase = useSyncExternalStore(
    subscribeAgentActivity,
    getAgentActivityPhase,
    getAgentActivityPhase,
  );
  const resultFocus = useSyncExternalStore(
    (onStoreChange) => {
      const unsubDoc = workspace.documentStore.subscribe(onStoreChange);
      const unsubSession = workspace.sessionStore.subscribe(onStoreChange);
      return () => {
        unsubDoc();
        unsubSession();
      };
    },
    () => readResultFocusSnapshot(workspace),
    () => readResultFocusSnapshot(workspace),
  );
  const busy = phase === 'busy';
  const inverted = live && agentMode;
  const showToggleBorder = live && canToggle && !inverted;
  /** Select focus has a landed render — same hasResult as the output–input toggle. */
  const resultAccent = resultFocus.hasResult;

  const liveClass = inverted
    ? 'cursor-pointer bg-black text-white hover:bg-black'
    : `${chromeTriggerClass(true, active)} ${
        active ? 'text-gray-900' : 'text-gray-900/70 hover:text-gray-900'
      }`;

  const borderClass = showToggleBorder
    ? 'border border-[rgb(172,172,172)]'
    : 'border border-transparent';

  const idleDotColor = resultAccent
    ? OUTPUT_ORANGE_ACCENT
    : inverted
      ? '#ffffff'
      : '#000000';
  const idleDotOpacity = resultAccent ? 1 : 0.55;

  return (
    <button
      type="button"
      disabled={!live}
      aria-pressed={active || inverted}
      title="Agent"
      className={`mx-[5px] inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${borderClass} ${
        live
          ? `${inverted ? '' : 'bg-gray-100 '} ${liveClass}`
          : `bg-gray-100 ${CHROME_BLOCKED_BUTTON_CLASS}`
      }`}
      onClick={() => {
        if (!live) return;
        onClick();
      }}
    >
      Agent
      {busy ? (
        <span
          aria-hidden
          className="agent-activity-spinner"
          style={{
            display: 'block',
            width: 8,
            height: 8,
            minWidth: 8,
            minHeight: 8,
            borderRadius: 9999,
            border: inverted
              ? '1.5px solid rgba(255,255,255,0.35)'
              : '1.5px solid rgba(0,0,0,0.25)',
            borderTopColor: inverted ? '#ffffff' : '#000000',
            flex: '0 0 8px',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            display: 'block',
            width: 6,
            height: 6,
            minWidth: 6,
            minHeight: 6,
            borderRadius: 9999,
            backgroundColor: idleDotColor,
            flex: '0 0 6px',
            opacity: idleDotOpacity,
          }}
        />
      )}
    </button>
  );
}
