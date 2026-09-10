import type { DocumentStore } from '../../authoring/document/documentStore';
import type { SessionStore } from '../../authoring/session/sessionStore';
import type { NodeRef, SketchNode } from '../../authoring/types';

type ResolvePaletteWorkspace = {
  documentStore: DocumentStore;
  sessionStore: SessionStore;
};

function paletteInSketch(
  sketch: SketchNode,
  id: string | null | undefined,
): id is string {
  if (!id) return false;
  return (sketch.palettes ?? []).some((palette) => palette.id === id);
}

/**
 * Active palette id for the Sketch the user is working with.
 * Selection (exactly one Sketch) wins, then activeSketchId.
 * Only returns ids present in that Sketch’s owned set.
 */
export function resolveSketchPaletteId(
  workspace: ResolvePaletteWorkspace,
): string | null {
  const session = workspace.sessionStore.getState();
  const nodes = workspace.documentStore.getState().nodes;

  const selection = session.selection;
  if (selection.size === 1) {
    const only = selection.values().next().value as NodeRef | undefined;
    if (only?.type === 'sketch') {
      const node = nodes[only.id];
      if (node?.type === 'sketch') {
        const sketch = node as SketchNode;
        if (paletteInSketch(sketch, sketch.paletteId)) {
          return sketch.paletteId;
        }
        return sketch.palettes?.[0]?.id ?? null;
      }
    }
  }

  if (session.activeSketchId) {
    const node = nodes[session.activeSketchId];
    if (node?.type === 'sketch') {
      const sketch = node as SketchNode;
      if (paletteInSketch(sketch, sketch.paletteId)) {
        return sketch.paletteId;
      }
      return sketch.palettes?.[0]?.id ?? null;
    }
  }

  return null;
}

/** Resolve the Sketch Node that owns the active palette set (selection / activeSketchId). */
export function resolveActiveSketchForPalettes(
  workspace: ResolvePaletteWorkspace,
): SketchNode | null {
  const session = workspace.sessionStore.getState();
  const nodes = workspace.documentStore.getState().nodes;

  if (session.selection.size === 1) {
    const only = session.selection.values().next().value as NodeRef | undefined;
    if (only?.type === 'sketch') {
      const node = nodes[only.id];
      if (node?.type === 'sketch') return node as SketchNode;
    }
  }

  if (session.activeSketchId) {
    const node = nodes[session.activeSketchId];
    if (node?.type === 'sketch') return node as SketchNode;
  }

  return null;
}
