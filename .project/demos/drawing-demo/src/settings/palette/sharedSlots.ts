import type { Brush, DocumentPalette } from './types';

/** Deep-copy slot lists (brushes + empties), preserving ids. */
export function cloneSlots(slots: Array<Brush | null>): Array<Brush | null> {
  return slots.map((slot) => (slot ? { ...slot } : null));
}

export function filledBrushes(slots: Array<Brush | null>): Brush[] {
  return slots.filter((slot): slot is Brush => slot != null).map((b) => ({ ...b }));
}

export function firstFilledBrushId(palette: DocumentPalette): string | null {
  for (const slot of palette.brushes) {
    if (slot) return slot.id;
  }
  return null;
}

export function countFilledInDocument(palettes: DocumentPalette[]): number {
  let n = 0;
  for (const palette of palettes) {
    for (const slot of palette.brushes) {
      if (slot) n += 1;
    }
  }
  return n;
}

/** Pad every palette to the max slot length with null empties. */
export function padPalettesToEqualLength(
  palettes: DocumentPalette[],
): DocumentPalette[] {
  if (palettes.length === 0) return [];
  const n = Math.max(...palettes.map((p) => p.brushes.length), 1);
  return palettes.map((palette) => {
    const brushes = cloneSlots(palette.brushes);
    while (brushes.length < n) {
      brushes.push(null);
    }
    return { ...palette, brushes };
  });
}

/**
 * Slot index for a brush id. Prefers the first palette that contains it.
 * Returns -1 if not found (orphan).
 */
export function slotIndexForBrushId(
  palettes: DocumentPalette[],
  brushId: string,
): number {
  for (const palette of palettes) {
    const index = palette.brushes.findIndex(
      (slot) => slot != null && slot.id === brushId,
    );
    if (index >= 0) return index;
  }
  return -1;
}

/** Build brushId → slot index for all filled slots (first wins on duplicates). */
export function buildBrushSlotIndexMap(
  palettes: DocumentPalette[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const palette of palettes) {
    palette.brushes.forEach((slot, index) => {
      if (slot && !map.has(slot.id)) {
        map.set(slot.id, index);
      }
    });
  }
  return map;
}

/** Apply the same from→to move on every palette's slot array. */
export function reorderSlots(
  palettes: DocumentPalette[],
  fromIndex: number,
  toIndex: number,
): DocumentPalette[] {
  if (palettes.length === 0) return [];
  const n = palettes[0]!.brushes.length;
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= n ||
    toIndex >= n
  ) {
    return palettes.map((p) => ({ ...p, brushes: cloneSlots(p.brushes) }));
  }

  return palettes.map((palette) => {
    const brushes = cloneSlots(palette.brushes);
    const [moved] = brushes.splice(fromIndex, 1);
    brushes.splice(toIndex, 0, moved ?? null);
    return { ...palette, brushes };
  });
}

/** Append a shared slot: active palette gets newBrush; others get null. */
export function appendSharedSlot(
  palettes: DocumentPalette[],
  activePaletteId: string,
  newBrush: Brush,
): DocumentPalette[] {
  return padPalettesToEqualLength(
    palettes.map((palette) => ({
      ...palette,
      brushes: [
        ...cloneSlots(palette.brushes),
        palette.id === activePaletteId ? { ...newBrush } : null,
      ],
    })),
  );
}

export function fillSlot(
  palettes: DocumentPalette[],
  paletteId: string,
  index: number,
  newBrush: Brush,
): DocumentPalette[] {
  return palettes.map((palette) => {
    if (palette.id !== paletteId) {
      return { ...palette, brushes: cloneSlots(palette.brushes) };
    }
    const brushes = cloneSlots(palette.brushes);
    if (index < 0 || index >= brushes.length) {
      return { ...palette, brushes };
    }
    if (brushes[index] != null) {
      return { ...palette, brushes };
    }
    brushes[index] = { ...newBrush };
    return { ...palette, brushes };
  });
}

/** Clear a filled slot to empty. Caller enforces last-filled guard. */
export function clearSlot(
  palettes: DocumentPalette[],
  paletteId: string,
  brushId: string,
): DocumentPalette[] {
  return palettes.map((palette) => {
    if (palette.id !== paletteId) {
      return { ...palette, brushes: cloneSlots(palette.brushes) };
    }
    const brushes = cloneSlots(palette.brushes);
    const index = brushes.findIndex(
      (slot) => slot != null && slot.id === brushId,
    );
    if (index < 0) return { ...palette, brushes };
    brushes[index] = null;
    return { ...palette, brushes };
  });
}

/**
 * Align a palette to length `n` using filled brushes (pad with null).
 * Used after New Palette / Revert.
 */
export function alignPaletteToLength(
  palette: DocumentPalette,
  n: number,
  filled: Brush[],
): DocumentPalette {
  const brushes: Array<Brush | null> = [];
  for (let i = 0; i < n; i += 1) {
    brushes.push(filled[i] ? { ...filled[i]! } : null);
  }
  return { ...palette, brushes };
}

export function sharedSlotCount(palettes: DocumentPalette[]): number {
  if (palettes.length === 0) return 0;
  return Math.max(...palettes.map((p) => p.brushes.length), 0);
}
