import {
  setActiveBrushId,
  setActivePaletteId,
  setActiveSketchId,
  setSelection,
  type SessionStore,
} from '../session/sessionStore';
import type { DocumentStore } from '../document/documentStore';
import type { NodeId } from '../ids';
import type { NodeRef, SketchNode } from '../types';
import { clampSessionActivePaletteId } from '../../settings/activePaletteSession';
import { firstFilledBrushId } from './sketchPalette';

type ActivateSketchWorkspace = {
  documentStore: DocumentStore;
  sessionStore: SessionStore;
};

/**
 * Structure-target a Sketch: Session activeSketchId + selection + palette bind.
 */
export function activateSketch(
  workspace: ActivateSketchWorkspace,
  sketchId: NodeId,
  options?: { select?: boolean },
): void {
  const node = workspace.documentStore.getState().nodes[sketchId];
  if (!node || node.type !== 'sketch') {
    return;
  }
  const sketch = node as SketchNode;
  const palettes = sketch.palettes ?? [];

  setActiveSketchId(workspace.sessionStore, sketchId);

  if (options?.select !== false) {
    setSelection(
      workspace.sessionStore,
      new Set<NodeRef>([{ type: 'sketch', id: sketchId }]),
    );
  }

  const activeId =
    sketch.paletteId && palettes.some((p) => p.id === sketch.paletteId)
      ? sketch.paletteId
      : palettes[0]?.id;
  if (!activeId) {
    return;
  }

  setActivePaletteId(workspace.sessionStore, activeId);
  const palette = palettes.find((entry) => entry.id === activeId);
  if (palette) {
    const brushId = firstFilledBrushId(palette);
    if (brushId) {
      setActiveBrushId(workspace.sessionStore, brushId);
    }
  }
  clampSessionActivePaletteId(workspace);

  const clampedId = workspace.sessionStore.getState().activePaletteId;
  if (clampedId && clampedId !== sketch.paletteId) {
    workspace.documentStore.setState((draft) => {
      const next = draft.nodes[sketchId];
      if (next?.type === 'sketch') {
        next.paletteId = clampedId;
      }
    });
  }
}
