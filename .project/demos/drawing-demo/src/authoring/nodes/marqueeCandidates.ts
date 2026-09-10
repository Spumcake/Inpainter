import { frameCardRect, imageRect } from '../document/selectors';
import type { DocumentState } from '../types/document';
import type { SessionState } from '../types/session';
import type { NodeRef, Rect } from '../types/nodes';
import { hasSelectableSketchBounds } from './factories';
import { canvasSelectEntries } from './container';
import { listGraphSurfaceStack } from './surfaceStack';

export type MarqueeCandidate = {
  ref: NodeRef;
  rect: Rect;
};

/** Axis-aligned overlap (edges touching counts). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

export function normalizeMarqueeRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Rect {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return {
    x,
    y,
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

export function nodesOverlappingMarquee(
  marquee: Rect,
  candidates: readonly MarqueeCandidate[],
): NodeRef[] {
  if (marquee.width <= 0 && marquee.height <= 0) {
    return [];
  }
  const refs: NodeRef[] = [];
  for (const candidate of candidates) {
    if (rectsOverlap(marquee, candidate.rect)) {
      refs.push(candidate.ref);
    }
  }
  return refs;
}

/**
 * Selectable Nodes for marquee on the focused surface.
 * Excludes locked / hidden; Canvas Frame is not in the Canvas stack.
 */
export function marqueeCandidatesForFocusedSurface(
  documentState: DocumentState,
  sessionState: SessionState,
): MarqueeCandidate[] {
  const { graphId, canvasId } = sessionState.viewFocus;
  const out: MarqueeCandidate[] = [];

  if (canvasId) {
    for (const entry of canvasSelectEntries(
      documentState,
      canvasId,
      sessionState.containerEditId ?? null,
    )) {
      if (entry.node.visible === false || entry.node.locked) continue;
      if (entry.kind === 'sketch') {
        const sketch = entry.node;
        if (!hasSelectableSketchBounds(sketch.canvas)) continue;
        out.push({
          ref: { type: 'sketch', id: sketch.id },
          rect: { ...sketch.canvas },
        });
      } else if (entry.kind === 'container') {
        const group = entry.node;
        if (!hasSelectableSketchBounds(group.canvas)) continue;
        out.push({
          ref: { type: 'container', id: group.id },
          rect: { ...group.canvas },
        });
      } else if (entry.kind === 'image') {
        const image = entry.node;
        out.push({
          ref: { type: 'image', id: image.id },
          rect: imageRect(image),
        });
      }
    }
    return out;
  }

  if (graphId) {
    for (const node of listGraphSurfaceStack(documentState, graphId)) {
      if (node.visible === false || node.locked) continue;
      if (node.type === 'frame') {
        out.push({
          ref: { type: 'frame', id: node.id },
          rect: frameCardRect(node),
        });
      } else if (node.type === 'image') {
        out.push({
          ref: { type: 'image', id: node.id },
          rect: imageRect(node),
        });
      }
    }
  }

  return out;
}

/** After resize-handle pointerdown: selection collapses to the target. */
export function selectionAfterResizeHandleDown(
  _selection: readonly NodeRef[],
  target: NodeRef,
): Set<NodeRef> {
  return new Set<NodeRef>([target]);
}
