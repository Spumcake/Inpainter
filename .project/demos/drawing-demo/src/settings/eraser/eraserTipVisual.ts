/** Visual diameter for eraser tip slots in header strips (px). */
export function eraserTipSlotDiameter(size: number, emphasized: boolean): number {
  const clamped = Math.max(1, Math.min(256, size));
  const normalized = 8 + (clamped / 256) * 17;
  return emphasized ? Math.min(25, normalized + 5) : Math.min(20, normalized);
}
