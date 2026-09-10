import { getNewBrushTemplate } from '../../settings/factory/loadDocumentPreferencesFactory';
import { cloneBrushesWithNewIds, clonePaletteSlots } from '../../settings/palette/cloneBrushes';
import { defaultPaletteStore } from '../../settings/palette/defaultPaletteStore';
import {
  alignPaletteToLength,
  appendSharedSlot,
  clearSlot,
  countFilledInDocument,
  fillSlot,
  filledBrushes,
  firstFilledBrushId,
  padPalettesToEqualLength,
  reorderSlots,
  sharedSlotCount,
} from '../../settings/palette/sharedSlots';
import type { Brush, DocumentPalette } from '../../settings/palette/types';
import type { DocumentStore } from '../document/documentStore';
import type { NodeId } from '../ids';
import type { SketchNode } from '../types';

export type SketchPaletteSet = {
  palettes: DocumentPalette[];
  paletteId: string;
};

function newPaletteId(): string {
  return `palette-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nextPaletteName(existing: DocumentPalette[]): string {
  return `Palette ${existing.length + 1}`;
}

function newBrush(nameIndex: number): Brush {
  return {
    id: `brush-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Brush ${nameIndex}`,
    ...getNewBrushTemplate(),
  };
}

function cloneSet(palettes: DocumentPalette[]): DocumentPalette[] {
  return padPalettesToEqualLength(
    palettes.map((palette) => ({
      ...palette,
      brushes: clonePaletteSlots(palette.brushes),
    })),
  );
}

/** Build a new Sketch-owned set from slot layout (staging / seed). Always `Palette 1`. */
export function buildPaletteSetFromSlots(
  slots: Array<Brush | null>,
  name = 'Palette 1',
): SketchPaletteSet {
  const filled = cloneBrushesWithNewIds(
    slots.filter((slot): slot is Brush => slot != null),
  );
  let filledIndex = 0;
  const layout: Array<Brush | null> = slots.map((slot) => {
    if (slot == null) return null;
    const next = filled[filledIndex] ?? null;
    filledIndex += 1;
    return next;
  });
  while (layout.length < 1) {
    layout.push(null);
  }
  const id = newPaletteId();
  return {
    palettes: [{ id, name: name.trim() || 'Palette 1', brushes: layout }],
    paletteId: id,
  };
}

/** Seed a minimal set from the default template (`Palette 1`). */
export function buildDefaultPaletteSet(): SketchPaletteSet {
  return buildPaletteSetFromSlots(
    cloneBrushesWithNewIds(defaultPaletteStore.getBrushes()),
    'Palette 1',
  );
}

export function getSketchNode(
  documentStore: DocumentStore,
  sketchId: NodeId,
): SketchNode | null {
  const node = documentStore.getState().nodes[sketchId];
  if (!node || node.type !== 'sketch') return null;
  return node as SketchNode;
}

export function getSketchPalettes(
  documentStore: DocumentStore,
  sketchId: NodeId,
): DocumentPalette[] {
  const sketch = getSketchNode(documentStore, sketchId);
  return sketch ? cloneSet(sketch.palettes ?? []) : [];
}

export function getSketchPalette(
  documentStore: DocumentStore,
  sketchId: NodeId,
  paletteId: string,
): DocumentPalette | null {
  return (
    getSketchPalettes(documentStore, sketchId).find((p) => p.id === paletteId) ??
    null
  );
}

export function getSketchBrushes(
  documentStore: DocumentStore,
  sketchId: NodeId,
  paletteId: string,
): Brush[] {
  const palette = getSketchPalette(documentStore, sketchId, paletteId);
  return palette ? filledBrushes(palette.brushes) : [];
}

function updateSketchPalettes(
  documentStore: DocumentStore,
  sketchId: NodeId,
  updater: (palettes: DocumentPalette[], sketch: SketchNode) => {
    palettes: DocumentPalette[];
    paletteId?: string;
  } | null,
): boolean {
  let changed = false;
  documentStore.setState((draft) => {
    const node = draft.nodes[sketchId];
    if (!node || node.type !== 'sketch') return;
    const sketch = node as SketchNode;
    const current = cloneSet(sketch.palettes ?? []);
    const result = updater(current, sketch);
    if (!result) return;
    sketch.palettes = padPalettesToEqualLength(result.palettes);
    if (result.paletteId) {
      sketch.paletteId = result.paletteId;
    } else if (!sketch.palettes.some((p) => p.id === sketch.paletteId)) {
      sketch.paletteId = sketch.palettes[0]?.id ?? '';
    }
    changed = true;
  });
  return changed;
}

export function setSketchActivePaletteId(
  documentStore: DocumentStore,
  sketchId: NodeId,
  paletteId: string,
): void {
  documentStore.setState((draft) => {
    const node = draft.nodes[sketchId];
    if (!node || node.type !== 'sketch') return;
    const sketch = node as SketchNode;
    if (!(sketch.palettes ?? []).some((p) => p.id === paletteId)) return;
    sketch.paletteId = paletteId;
  });
}

export function addPaletteToSketch(
  documentStore: DocumentStore,
  sketchId: NodeId,
  name?: string,
): string | null {
  let createdId: string | null = null;
  updateSketchPalettes(documentStore, sketchId, (palettes) => {
    const id = newPaletteId();
    createdId = id;
    const template = cloneBrushesWithNewIds(defaultPaletteStore.getBrushes());
    const n = Math.max(sharedSlotCount(palettes), template.length, 1);
    let next = [
      ...palettes,
      alignPaletteToLength(
        {
          id,
          name: name?.trim() || nextPaletteName(palettes),
          brushes: [],
        },
        n,
        template,
      ),
    ];
    next = padPalettesToEqualLength(next);
    return { palettes: next, paletteId: id };
  });
  return createdId;
}

export function removePaletteFromSketch(
  documentStore: DocumentStore,
  sketchId: NodeId,
  paletteId: string,
): boolean {
  let removed = false;
  updateSketchPalettes(documentStore, sketchId, (palettes, sketch) => {
    if (palettes.length <= 1) return null;
    const next = palettes.filter((p) => p.id !== paletteId);
    if (next.length === palettes.length) return null;
    removed = true;
    const nextActive =
      sketch.paletteId === paletteId ? next[0]!.id : sketch.paletteId;
    return { palettes: next, paletteId: nextActive };
  });
  return removed;
}

export function renameSketchPalette(
  documentStore: DocumentStore,
  sketchId: NodeId,
  paletteId: string,
  name: string,
): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  updateSketchPalettes(documentStore, sketchId, (palettes) => {
    const index = palettes.findIndex((p) => p.id === paletteId);
    if (index === -1) return null;
    const next = [...palettes];
    next[index] = { ...next[index]!, name: trimmed };
    return { palettes: next };
  });
}

export function resetSketchPaletteToDefault(
  documentStore: DocumentStore,
  sketchId: NodeId,
  paletteId: string,
): void {
  updateSketchPalettes(documentStore, sketchId, (palettes) => {
    const index = palettes.findIndex((p) => p.id === paletteId);
    if (index === -1) return null;
    const n = Math.max(sharedSlotCount(palettes), 1);
    const filled = cloneBrushesWithNewIds(defaultPaletteStore.getBrushes());
    const targetN = Math.max(n, filled.length);
    let next = [...palettes];
    next[index] = alignPaletteToLength(next[index]!, targetN, filled);
    next = padPalettesToEqualLength(next);
    return { palettes: next };
  });
}

export function reorderSketchSlots(
  documentStore: DocumentStore,
  sketchId: NodeId,
  fromIndex: number,
  toIndex: number,
): void {
  updateSketchPalettes(documentStore, sketchId, (palettes) => ({
    palettes: reorderSlots(palettes, fromIndex, toIndex),
  }));
}

export function appendSketchSlot(
  documentStore: DocumentStore,
  sketchId: NodeId,
  paletteId: string,
): string | null {
  let brushId: string | null = null;
  updateSketchPalettes(documentStore, sketchId, (palettes) => {
    if (!palettes.some((p) => p.id === paletteId)) return null;
    const filledCount = filledBrushes(
      palettes.find((p) => p.id === paletteId)!.brushes,
    ).length;
    const brush = newBrush(filledCount + 1);
    brushId = brush.id;
    return { palettes: appendSharedSlot(palettes, paletteId, brush) };
  });
  return brushId;
}

export function fillSketchSlot(
  documentStore: DocumentStore,
  sketchId: NodeId,
  paletteId: string,
  index: number,
): string | null {
  let brushId: string | null = null;
  updateSketchPalettes(documentStore, sketchId, (palettes) => {
    const palette = palettes.find((p) => p.id === paletteId);
    if (!palette) return null;
    if (index < 0 || index >= palette.brushes.length || palette.brushes[index] != null) {
      return null;
    }
    const brush = newBrush(filledBrushes(palette.brushes).length + 1);
    brushId = brush.id;
    return { palettes: fillSlot(palettes, paletteId, index, brush) };
  });
  return brushId;
}

export function patchSketchBrush(
  documentStore: DocumentStore,
  sketchId: NodeId,
  paletteId: string,
  brushId: string,
  partial: Partial<Omit<Brush, 'id'>>,
): void {
  updateSketchPalettes(documentStore, sketchId, (palettes) => {
    const paletteIndex = palettes.findIndex((p) => p.id === paletteId);
    if (paletteIndex === -1) return null;
    const brushes = clonePaletteSlots(palettes[paletteIndex]!.brushes);
    const brushIndex = brushes.findIndex(
      (slot) => slot != null && slot.id === brushId,
    );
    if (brushIndex === -1 || brushes[brushIndex] == null) return null;
    brushes[brushIndex] = { ...brushes[brushIndex]!, ...partial };
    const next = [...palettes];
    next[paletteIndex] = { ...next[paletteIndex]!, brushes };
    return { palettes: next };
  });
}

export function clearSketchSlot(
  documentStore: DocumentStore,
  sketchId: NodeId,
  paletteId: string,
  brushId: string,
): boolean {
  let cleared = false;
  updateSketchPalettes(documentStore, sketchId, (palettes) => {
    const palette = palettes.find((p) => p.id === paletteId);
    if (!palette) return null;
    if (!palette.brushes.some((s) => s != null && s.id === brushId)) {
      return null;
    }
    if (countFilledInDocument(palettes) <= 1) return null;
    cleared = true;
    return { palettes: clearSlot(palettes, paletteId, brushId) };
  });
  return cleared;
}

/**
 * Ensure every Sketch has a valid non-empty palette set.
 * Migrates legacy flat-catalog rows when `legacyCatalog` is provided.
 */
export function repairSketchPaletteSets(
  documentStore: DocumentStore,
  legacyCatalog: DocumentPalette[] = [],
): number {
  const byId = new Map(legacyCatalog.map((p) => [p.id, p]));
  let repaired = 0;

  documentStore.setState((draft) => {
    for (const node of Object.values(draft.nodes)) {
      if (node.type !== 'sketch') continue;
      const sketch = node as SketchNode;
      const existing = sketch.palettes ?? [];
      const hasValidSet =
        existing.length > 0 &&
        existing.some((p) => p.id === sketch.paletteId || !sketch.paletteId);

      if (hasValidSet && existing.length > 0) {
        sketch.palettes = padPalettesToEqualLength(
          existing.map((p) => ({
            ...p,
            brushes: clonePaletteSlots(p.brushes),
          })),
        );
        if (!sketch.palettes.some((p) => p.id === sketch.paletteId)) {
          sketch.paletteId = sketch.palettes[0]!.id;
          repaired += 1;
        }
        continue;
      }

      const legacy = sketch.paletteId ? byId.get(sketch.paletteId) : undefined;
      if (legacy) {
        sketch.palettes = padPalettesToEqualLength([
          {
            ...legacy,
            brushes: clonePaletteSlots(legacy.brushes),
          },
        ]);
        sketch.paletteId = legacy.id;
      } else {
        const seeded = buildDefaultPaletteSet();
        sketch.palettes = seeded.palettes;
        sketch.paletteId = seeded.paletteId;
      }
      repaired += 1;
    }
  });

  return repaired;
}

/** @deprecated Use repairSketchPaletteSets */
export const repairSketchPaletteBinds = repairSketchPaletteSets;

export { firstFilledBrushId };
