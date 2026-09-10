import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, Ellipsis } from 'lucide-react';
import { OUTPUT_ORANGE_TEXT_CLASS } from '../../authoring/nodes/nodeChrome';
import {
  setFramePrompt,
  setImagePrompt,
  setSketchPrompt,
  setContainerPrompt,
} from '../../authoring/nodes';
import type { AuthoringWorkspace } from '../../authoring/workspace';
import type { NodeRef } from '../../authoring/types/nodes';
import { submitPromptHandoff } from '../../agent/promptHandoff';
import type { ProviderRecord } from '../../settings/provider-servers/types';
import { loadPromptProviders } from './promptProviders';

type PromptStripSlotProps = {
  workspace: AuthoringWorkspace;
  nodeRef: NodeRef;
  onPromptSubmit?: () => void;
  onOpenPromptCompiler?: () => void;
  promptCompilerOpen?: boolean;
};

function readNodePrompt(
  workspace: AuthoringWorkspace,
  nodeRef: NodeRef,
): { prompt: string; name: string } | null {
  const node = workspace.documentStore.getState().nodes[nodeRef.id];
  if (!node || node.type !== nodeRef.type) {
    return null;
  }
  if (node.type === 'frame' || node.type === 'sketch' || node.type === 'image' || node.type === 'container') {
    return { prompt: node.prompt ?? '', name: node.name };
  }
  return null;
}

export function PromptStripSlot({
  workspace,
  nodeRef,
  onPromptSubmit,
  onOpenPromptCompiler,
  promptCompilerOpen = false,
}: PromptStripSlotProps) {
  const stored = readNodePrompt(workspace, nodeRef);
  const storedPrompt = stored?.prompt ?? '';
  const [draft, setDraft] = useState(storedPrompt);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  );
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providerOpen, setProviderOpen] = useState(false);
  const providerRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const selectedProviderIdRef = useRef(selectedProviderId);
  selectedProviderIdRef.current = selectedProviderId;

  useEffect(() => {
    setDraft(storedPrompt);
  }, [nodeRef.id, nodeRef.type, storedPrompt]);

  useEffect(() => {
    let cancelled = false;
    setProvidersLoading(true);
    void loadPromptProviders().then((result) => {
      if (cancelled) return;
      setProviders(result.providers);
      setSelectedProviderId(result.selectedId);
      setProvidersLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!providerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        providerRef.current &&
        !providerRef.current.contains(event.target as Node)
      ) {
        setProviderOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [providerOpen]);

  const flushPrompt = () => {
    const next = draftRef.current;
    const current = readNodePrompt(workspace, nodeRef);
    if (!current || current.prompt === next) {
      return;
    }
    if (nodeRef.type === 'frame') {
      workspace.runner.dispatch(setFramePrompt(nodeRef.id, next));
    } else if (nodeRef.type === 'sketch') {
      workspace.runner.dispatch(setSketchPrompt(nodeRef.id, next));
    } else if (nodeRef.type === 'image') {
      workspace.runner.dispatch(setImagePrompt(nodeRef.id, next));
    } else if (nodeRef.type === 'container') {
      workspace.runner.dispatch(setContainerPrompt(nodeRef.id, next));
    }
  };

  const handleSubmit = () => {
    flushPrompt();
    const current = readNodePrompt(workspace, nodeRef);
    submitPromptHandoff({
      nodeRef,
      name: current?.name ?? String(nodeRef.id),
      prompt: draftRef.current,
      providerId: selectedProviderIdRef.current,
    });
    onPromptSubmit?.();
  };

  const providersReady = !providersLoading && providers.length > 0;
  const chipLabel = providersLoading
    ? 'Providers…'
    : selectedProviderId ?? 'No providers';

  return (
    <>
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={flushPrompt}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Context"
        className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-chrome-muted"
        aria-label="Prompt"
      />
      <div className="flex shrink-0 items-center gap-0">
        <button
          type="button"
          title="Prompt Compiler Settings"
          aria-label="Prompt Compiler Settings"
          aria-pressed={promptCompilerOpen}
          className={`inline-flex shrink-0 items-center justify-center rounded-full p-0.5 ${OUTPUT_ORANGE_TEXT_CLASS} hover:bg-gray-100 ${
            promptCompilerOpen ? 'bg-gray-100' : ''
          }`}
          onClick={() => onOpenPromptCompiler?.()}
        >
          <Ellipsis size={16} strokeWidth={2.5} />
        </button>
        <div className="relative shrink-0" ref={providerRef}>
          <button
            type="button"
            disabled={!providersReady}
            className={`inline-flex w-[7.5rem] items-center gap-1 rounded-full py-1 pl-1 pr-2 text-xs font-medium transition-colors ${
            providersReady
              ? 'text-gray-600 hover:text-gray-900'
              : 'cursor-not-allowed text-chrome-muted'
          }`}
          title={
            providersLoading
              ? 'Loading providers'
              : providersReady
                ? 'Provider'
                : 'No providers connected'
          }
          aria-label="Provider"
          aria-haspopup={providersReady ? 'listbox' : undefined}
          aria-expanded={providersReady ? providerOpen : undefined}
          onClick={() => {
            if (!providersReady) return;
            setProviderOpen((open) => !open);
          }}
        >
          <span className="min-w-0 flex-1 truncate text-left">{chipLabel}</span>
          <ChevronDown
            size={14}
            className={providersReady ? 'shrink-0' : 'invisible shrink-0'}
            aria-hidden={!providersReady}
          />
        </button>
        {providerOpen && providersReady ? (
          <div className="absolute bottom-full right-0 z-30 mb-2 min-w-[9rem] overflow-hidden rounded-xl border border-chrome-border bg-chrome-surface py-1 shadow-lg">
            {providers.map((provider) => (
              <button
                key={provider.provider_id}
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-50 ${
                  provider.provider_id === selectedProviderId
                    ? 'text-gray-900'
                    : 'text-gray-600'
                }`}
                onClick={() => {
                  setSelectedProviderId(provider.provider_id);
                  setProviderOpen(false);
                }}
              >
                {provider.provider_id}
              </button>
            ))}
          </div>
        ) : null}
        </div>
      </div>
      <button
        type="button"
        title="Send"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white transition-opacity hover:opacity-90 active:scale-95"
        onClick={handleSubmit}
      >
        <ArrowUp size={16} strokeWidth={2.5} />
      </button>
    </>
  );
}
