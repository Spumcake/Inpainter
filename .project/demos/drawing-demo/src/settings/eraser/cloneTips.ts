import type { EraserTip } from './types';

function newTipId(): string {
  return `eraser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Deep-copy tips with fresh ids (for New Eraser set / Revert). */
export function cloneTipsWithNewIds(tips: EraserTip[]): EraserTip[] {
  return tips.map((tip) => ({
    ...tip,
    id: newTipId(),
  }));
}

/** Deep-copy tips preserving ids (hydrate / migrate). */
export function cloneTips(tips: EraserTip[]): EraserTip[] {
  return tips.map((tip) => ({ ...tip }));
}
