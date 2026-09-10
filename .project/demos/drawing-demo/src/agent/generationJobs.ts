export type GenerationJobPhase =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed';

export type GenerationJob = {
  handoffId: string;
  /** Node id for Frame window busy state (and similar). */
  nodeId?: string;
  phase: GenerationJobPhase;
  error?: string;
  imageUrl?: string;
  jobId?: string;
};

export function isGenerationJobBusy(phase: GenerationJobPhase): boolean {
  return phase === 'queued' || phase === 'running';
}

type Listener = () => void;

const jobsByHandoffId = new Map<string, GenerationJob>();
const listeners = new Set<Listener>();
/** Stable snapshot for useSyncExternalStore (must keep referential identity until mutate). */
let jobsSnapshot: readonly GenerationJob[] = [];

function emit(): void {
  jobsSnapshot = Array.from(jobsByHandoffId.values());
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeGenerationJobs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGenerationJobs(): readonly GenerationJob[] {
  return jobsSnapshot;
}

export function getGenerationJob(handoffId: string): GenerationJob | undefined {
  return jobsByHandoffId.get(handoffId);
}

export function upsertGenerationJob(job: GenerationJob): void {
  jobsByHandoffId.set(job.handoffId, job);
  emit();
}

/** Test helper. */
export function clearGenerationJobs(): void {
  jobsByHandoffId.clear();
  emit();
}
