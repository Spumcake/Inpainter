type SlotKeyed = {
  paletteId?: string;
};

/** Slot index for a sublayer; unbound / unknown brush ids are orphans (−1). */
export function sublayerSlotIndex(
  sublayer: SlotKeyed,
  slotIndexByBrushId: Map<string, number>,
): number {
  if (!sublayer.paletteId) return -1;
  return slotIndexByBrushId.get(sublayer.paletteId) ?? -1;
}

/**
 * Order sublayers for SVG paint (first = bottom, last = top).
 * Orphans under all slots; among slots, higher index under lower index
 * (LTR strip: leftmost / index 0 on top).
 * Same-slot relative order is preserved (stable sort).
 */
export function sortSublayersBySlot<T extends SlotKeyed>(
  sublayers: readonly T[],
  slotIndexByBrushId: Map<string, number>,
): T[] {
  return sublayers
    .map((sublayer, index) => ({ sublayer, index }))
    .sort((a, b) => {
      const slotA = sublayerSlotIndex(a.sublayer, slotIndexByBrushId);
      const slotB = sublayerSlotIndex(b.sublayer, slotIndexByBrushId);
      const orphanA = slotA < 0;
      const orphanB = slotB < 0;
      if (orphanA !== orphanB) return orphanA ? -1 : 1;
      if (slotA !== slotB) {
        // Descending slot index among filled slots (0 paints last = top).
        return slotB - slotA;
      }
      return a.index - b.index;
    })
    .map(({ sublayer }) => sublayer);
}
