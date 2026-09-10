export type AgentActivityPhase = 'idle' | 'busy' | 'finished';

type Listener = () => void;

let phase: AgentActivityPhase = 'idle';
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeAgentActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAgentActivityPhase(): AgentActivityPhase {
  return phase;
}

export function setAgentActivityPhase(next: AgentActivityPhase): void {
  if (phase === next) return;
  phase = next;
  emit();
}

/** Test helper. */
export function resetAgentActivity(): void {
  phase = 'idle';
  emit();
}
