import { useSyncExternalStore } from 'react';
import {
  getGenerationJob,
  getGenerationJobs,
  subscribeGenerationJobs,
} from '../agent/generationJobs';
import {
  getPromptHandoffs,
  subscribePromptHandoffs,
} from '../agent/promptHandoff';
import { GlobalPanel } from './GlobalPanel';
import type { GlobalPanelListItem } from './types';

type AgentPanelProps = {
  onClose: () => void;
};

function snippet(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return '(empty prompt)';
  }
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

function jobMeta(
  phase: string | undefined,
  error: string | undefined,
): string {
  if (!phase) return 'queued';
  if (phase === 'failed') {
    return error ? `failed · ${error}` : 'failed';
  }
  return phase;
}

export function AgentPanel({ onClose }: AgentPanelProps) {
  const handoffs = useSyncExternalStore(
    subscribePromptHandoffs,
    getPromptHandoffs,
    getPromptHandoffs,
  );
  useSyncExternalStore(
    subscribeGenerationJobs,
    getGenerationJobs,
    getGenerationJobs,
  );

  const items: GlobalPanelListItem[] = handoffs.map((entry) => {
    const provider = entry.providerId ?? 'no provider';
    const job = getGenerationJob(entry.id);
    return {
      id: entry.id,
      label: entry.name,
      meta: `${entry.nodeRef.type} · ${provider} · ${jobMeta(job?.phase, job?.error)} · ${snippet(entry.prompt)}`,
      isActive: job?.phase === 'running' || job?.phase === 'queued',
      onSelect: () => {
        /* jump-to-Node deferred */
      },
    };
  });

  return (
    <GlobalPanel
      ariaLabel="Agent"
      emptyLabel="No agent activity"
      items={items}
      onClose={onClose}
    />
  );
}
