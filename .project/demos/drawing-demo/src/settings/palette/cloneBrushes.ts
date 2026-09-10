import type { Brush } from './types';
import { cloneSlots } from './sharedSlots';

function newBrushId(): string {
  return `brush-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Deep-copy brushes with fresh ids (for New Palette / Revert). Nulls dropped. */
export function cloneBrushesWithNewIds(brushes: Brush[]): Brush[] {
  return brushes.map((brush) => ({
    ...brush,
    id: newBrushId(),
  }));
}

/** Deep-copy filled brushes only (default template / Preferences). */
export function cloneBrushes(brushes: Brush[]): Brush[] {
  return brushes.map((brush) => ({ ...brush }));
}

/** Deep-copy document palette slots including empties. */
export function clonePaletteSlots(
  slots: Array<Brush | null>,
): Array<Brush | null> {
  return cloneSlots(slots);
}
