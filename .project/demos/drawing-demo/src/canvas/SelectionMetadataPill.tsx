import { useSyncExternalStore } from 'react';
import type { AuthoringWorkspace } from '../authoring/workspace';
import {
  chromeForNode,
  chromeForNodeType,
  OUTPUT_ORANGE_TEXT_CLASS,
  renameFrame,
  renameImage,
  renameSketch,
  renameContainer,
  resolveOutputInputToggleTarget,
} from '../authoring/nodes';
import type {
  FrameNode,
  ImageNode,
  ContainerNode,
  SketchNode,
} from '../authoring/types';
import { InlineRenameLabel } from '../components/InlineRenameLabel';
import {
  authoringSurfaceFromViewFocus,
  resolveEditDestination,
  resolveGroupEditReturn,
} from './editDestination';
import { resolveSelectionMetadataTarget } from './selectionMetadataTarget';

type SelectionMetadataPillProps = {
  workspace: AuthoringWorkspace;
  /** Chrome live gate (idle authoring) — not Canvas-focus-only. */
  canvasLive: boolean;
};

/** Shared control height so name-only and name+Edit pills match (14px icon + py-1). */
const PILL_CONTROL_DARK =
  'inline-flex h-[22px] items-center rounded text-xs font-medium text-white transition-colors hover:bg-white/15';

const PILL_CONTROL_LIGHT =
  'inline-flex h-[22px] items-center rounded text-xs font-medium text-gray-900 transition-colors hover:bg-gray-100';

/** Agent mode + Frame output view with a render result — orange label (inherits icon). */
const PILL_CONTROL_AGENT_RESULT =
  'inline-flex h-[22px] items-center rounded text-xs font-medium transition-colors hover:bg-gray-100';

const PILL_RENAME_INPUT_DARK =
  'max-w-[200px] rounded border border-white/40 bg-white/95 px-1.5 py-0.5 text-xs font-medium text-gray-800 outline-none focus:border-white';

const PILL_RENAME_INPUT_LIGHT =
  'max-w-[200px] rounded border border-chrome-border bg-white px-1.5 py-0.5 text-xs font-medium text-gray-800 outline-none focus:border-gray-400';

export function SelectionMetadataPill({
  workspace,
  canvasLive,
}: SelectionMetadataPillProps) {
  useSyncExternalStore(
    (onStoreChange) => workspace.sessionStore.subscribe(onStoreChange),
    () => workspace.sessionStore.getState(),
    () => workspace.sessionStore.getState(),
  );
  useSyncExternalStore(
    (onStoreChange) => workspace.documentStore.subscribe(onStoreChange),
    () => workspace.documentStore.getState(),
    () => workspace.documentStore.getState(),
  );

  const session = workspace.sessionStore.getState();
  const document = workspace.documentStore.getState();
  const groupEditReturn = resolveGroupEditReturn(workspace, session);
  if (groupEditReturn) {
    const ReturnIcon = groupEditReturn.Icon;
    const chrome = chromeForNodeType('sketch')!;
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center pt-12">
        <div className="pointer-events-auto flex items-stretch gap-2">
          <div
            className={`flex items-center gap-0 rounded-[0.75rem] ${chrome.pillBgClass} px-1 py-0.5 text-xs text-white shadow-sm`}
          >
            <button
              type="button"
              className={`${PILL_CONTROL_DARK} gap-1 px-2`}
              title={groupEditReturn.label}
              aria-label={groupEditReturn.label}
              onClick={groupEditReturn.go}
            >
              <ReturnIcon size={14} strokeWidth={2} />
              <span>{groupEditReturn.label}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const target = resolveSelectionMetadataTarget(session, document, canvasLive);
  if (!target) {
    return null;
  }

  const node = document.nodes[target.id];
  if (!node || node.type !== target.type) {
    return null;
  }

  const agentLight = session.agentMode;
  const resultFocus = resolveOutputInputToggleTarget({
    nodes: document.nodes,
    selection: session.selection,
    canvasFrameId: session.canvasFrameId,
  });
  const agentResultOutput =
    agentLight &&
    resultFocus?.hasResult === true &&
    resultFocus.resultView === 'output';
  const chrome = agentLight
    ? chromeForNodeType('output')
    : chromeForNode(node, document.nodes);
  if (!chrome) {
    return null;
  }
  const isFrame = node.type === 'frame';
  const isImage = node.type === 'image';
  const isGroup = node.type === 'container';
  const surface = authoringSurfaceFromViewFocus(session.viewFocus);
  const editDestination =
    agentLight && !isFrame
      ? null
      : resolveEditDestination(workspace, node, surface, session);
  const name = isFrame
    ? (node as FrameNode).name
    : isImage
      ? (node as ImageNode).name
      : isGroup
        ? (node as ContainerNode).name
        : (node as SketchNode).name;
  const pillBg = agentLight ? 'bg-chrome-surface' : chrome.pillBgClass;
  const controlClass = agentResultOutput
    ? PILL_CONTROL_AGENT_RESULT
    : agentLight
      ? PILL_CONTROL_LIGHT
      : PILL_CONTROL_DARK;
  const pillTextClass = agentResultOutput
    ? OUTPUT_ORANGE_TEXT_CLASS
    : agentLight
      ? 'text-gray-900'
      : 'text-white shadow-sm';
  const renameTitle = isFrame
    ? 'Rename frame'
    : isImage
      ? 'Rename image'
      : isGroup
        ? 'Rename group'
        : 'Rename sketch';

  const onRename = (next: string) => {
    if (isFrame) {
      workspace.runner.dispatch(renameFrame(node.id, next));
      return;
    }
    if (isImage) {
      workspace.runner.dispatch(renameImage(node.id, next));
      return;
    }
    if (isGroup) {
      workspace.runner.dispatch(renameContainer(node.id, next));
      return;
    }
    workspace.runner.dispatch(renameSketch(node.id, next));
  };

  const EditIcon = editDestination?.Icon;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center pt-12">
      <div className="pointer-events-auto flex items-stretch gap-2">
        <div
          className={`flex items-center gap-0 -space-x-1 rounded-[0.75rem] ${pillBg} px-1 py-0.5 text-xs ${pillTextClass}`}
        >
          <InlineRenameLabel
            value={name}
            live={canvasLive}
            title={renameTitle}
            className={`${controlClass} cursor-text px-1.5`}
            inputClassName={
              agentLight ? PILL_RENAME_INPUT_LIGHT : PILL_RENAME_INPUT_DARK
            }
            onCommit={onRename}
          />
          {editDestination && EditIcon ? (
            <button
              type="button"
              className={`${controlClass} justify-center px-1`}
              title={editDestination.label}
              aria-label={editDestination.label}
              onClick={editDestination.go}
            >
              <EditIcon size={14} strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
