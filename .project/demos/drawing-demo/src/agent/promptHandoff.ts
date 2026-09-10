import type { NodeRef } from '../authoring/types/nodes';
import { startGenerationFromHandoff } from './generationBridge';

export type PromptHandoff = {
  id: string;
  nodeRef: NodeRef;
  name: string;
  prompt: string;
  /** Selected Pipe provider id from the Prompt Editor chip; null if none. */
  providerId: string | null;
  submittedAt: number;
};

type Listener = () => void;

let handoffs: PromptHandoff[] = [];
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribePromptHandoffs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPromptHandoffs(): readonly PromptHandoff[] {
  return handoffs;
}

export function submitPromptHandoff(args: {
  nodeRef: NodeRef;
  name: string;
  prompt: string;
  providerId?: string | null;
}): PromptHandoff {
  const entry: PromptHandoff = {
    id: `handoff-${args.nodeRef.type}-${args.nodeRef.id}-${Date.now()}`,
    nodeRef: args.nodeRef,
    name: args.name,
    prompt: args.prompt,
    providerId: args.providerId ?? null,
    submittedAt: Date.now(),
  };
  handoffs = [entry, ...handoffs].slice(0, 50);
  emit();
  void startGenerationFromHandoff(entry);
  return entry;
}

/** Test helper — clears handoff list. */
export function clearPromptHandoffs(): void {
  handoffs = [];
  emit();
}
