import type { DocumentStore } from '../authoring/document/documentStore';
import {
  setActiveBrushId,
  setActivePaletteId,
  type SessionStore,
} from '../authoring/session';
import type { SketchNode } from '../authoring/types';
import { firstFilledBrushId } from '../authoring/nodes/sketchPalette';
import { resolvePaintSketchTarget } from '../authoring/nodes/paintSketchTarget';
import { isPaletteStagingMode } from './configDomain';

type ClampWorkspace = {
  documentStore: DocumentStore;
  sessionStore: SessionStore;
};

function resolveTargetSketch(
  workspace: ClampWorkspace,
): SketchNode | null {
  const session = workspace.sessionStore.getState();
  const nodes = workspace.documentStore.getState().nodes;
  const fromSelection = resolvePaintSketchTarget(session.selection, nodes);
  const sketchId = fromSelection ?? session.activeSketchId;
  if (!sketchId) return null;
  const node = nodes[sketchId];
  if (!node || node.type !== 'sketch') return null;
  return node as SketchNode;
}

/**
 * Ensure Session activePaletteId / activeBrushId point into the active Sketch’s set.
 * No-op while in tool staging (pre-Sketch).
 */
export function clampSessionActivePaletteId(workspace: ClampWorkspace): void {
  const { sessionStore, documentStore } = workspace;
  const nodes = documentStore.getState().nodes;
  if (isPaletteStagingMode(sessionStore.getState(), nodes)) {
    return;
  }

  const sketch = resolveTargetSketch(workspace);
  const palettes = sketch?.palettes ?? [];
  if (palettes.length === 0) {
    setActivePaletteId(sessionStore, null);
    setActiveBrushId(sessionStore, null);
    return;
  }

  const state = sessionStore.getState();
  let paletteId = state.activePaletteId;
  if (!paletteId || !palettes.some((palette) => palette.id === paletteId)) {
    paletteId =
      sketch!.paletteId && palettes.some((p) => p.id === sketch!.paletteId)
        ? sketch!.paletteId
        : palettes[0]!.id;
    setActivePaletteId(sessionStore, paletteId);
  }

  const palette = palettes.find((entry) => entry.id === paletteId)!;
  const filled = palette.brushes.filter((slot): slot is NonNullable<typeof slot> => slot != null);
  if (filled.length === 0) {
    setActiveBrushId(sessionStore, null);
    return;
  }

  const brushId = state.activeBrushId;
  if (brushId && filled.some((brush) => brush.id === brushId)) {
    return;
  }

  setActiveBrushId(sessionStore, firstFilledBrushId(palette));
}
