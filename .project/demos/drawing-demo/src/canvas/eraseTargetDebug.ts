export type EraseTargetDebugReason =
  | 'hydrate'
  | 'skip-empty'
  | 'skip-no-target'
  | 'repair-orphans';

export type EraseTargetDebugPayload = {
  activeTool: string;
  eraseTargetSketchId: string | null;
  activeBrushId: string | null;
  sublayerId: string | null | undefined;
  erasePreviewSublayerId: string | null;
  pathCount: number;
  liveEngineId: string | null;
  reason: EraseTargetDebugReason;
  moved?: number;
};

/** DEV-only erase target diagnostics — no-op in production builds. */
export function logEraseTarget(payload: EraseTargetDebugPayload): void {
  if (!import.meta.env.DEV) {
    return;
  }
  console.info('[erase-target]', payload);
}
