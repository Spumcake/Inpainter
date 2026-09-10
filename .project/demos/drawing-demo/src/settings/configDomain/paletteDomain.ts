import { resolvePaintSketchTarget } from '../../authoring/nodes/paintSketchTarget';
import {
  buildPaletteSetFromSlots,
  type SketchPaletteSet,
} from '../../authoring/nodes/sketchPalette';
import {
  setPaintStaging,
  type SessionStore,
} from '../../authoring/session/sessionStore';
import type { Node } from '../../authoring/types';
import type { SessionState } from '../../authoring/types/session';
import { getNewBrushTemplate } from '../factory/loadDocumentPreferencesFactory';
import { cloneBrushesWithNewIds, clonePaletteSlots } from '../palette/cloneBrushes';
import { defaultPaletteStore } from '../palette/defaultPaletteStore';
import type { Brush } from '../palette/types';
import { registerConfigDomain } from './registry';

function newStagingBrushId(): string {
  return `staging-brush-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function firstFilledId(slots: Array<Brush | null>): string | null {
  for (const slot of slots) {
    if (slot) return slot.id;
  }
  return null;
}

export function isPaletteStagingMode(
  session: SessionState,
  nodes?: Readonly<Record<string, Node>>,
): boolean {
  if (session.activeTool !== 'paint') {
    return false;
  }
  return resolvePaintSketchTarget(session.selection, nodes) === null;
}

export function ensurePaintStaging(sessionStore: SessionStore): void {
  const existing = sessionStore.getState().paintStaging;
  if (existing) {
    if (!existing.name) {
      setPaintStaging(sessionStore, { ...existing, name: 'Palette 1' });
    }
    return;
  }
  const brushes = clonePaletteSlots(
    cloneBrushesWithNewIds(defaultPaletteStore.getBrushes()),
  );
  const activeBrushId = firstFilledId(brushes);
  setPaintStaging(sessionStore, {
    name: 'Palette 1',
    brushes,
    activeBrushId,
  });
}

export function createStagingBrush(nameIndex: number): Brush {
  return {
    id: newStagingBrushId(),
    name: `Brush ${nameIndex}`,
    ...getNewBrushTemplate(),
  };
}

/**
 * Clone Session paint staging into a new Sketch-owned palette set (`Palette 1`).
 * Does not write DocumentSettings. Staging content is left intact for the window.
 */
export function materializePaintStagingToPaletteSet(
  sessionStore: SessionStore,
): SketchPaletteSet {
  ensurePaintStaging(sessionStore);
  const staging = sessionStore.getState().paintStaging!;
  return buildPaletteSetFromSlots(
    staging.brushes,
    staging.name.trim() || 'Palette 1',
  );
}

/** @deprecated Prefer materializePaintStagingToPaletteSet — returns active palette id only. */
export function materializePaintStagingToPalette(
  sessionStore: SessionStore,
): string {
  return materializePaintStagingToPaletteSet(sessionStore).paletteId;
}

registerConfigDomain({
  id: 'palette',
  /** Paint stages pre-Sketch; createSketch materializes the same draft. */
  usesDomain: (activeTool) =>
    activeTool === 'paint' || activeTool === 'createSketch',
  ensureStaging: ensurePaintStaging,
  /** Ensure draft for paint (no Sketch) and whenever createSketch is latched. */
  isStagingMode: (session, nodes) => {
    if (session.activeTool === 'createSketch') return true;
    return isPaletteStagingMode(session, nodes);
  },
});
