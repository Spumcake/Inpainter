import type { NodeId } from '../ids';
import type { Node, NodeRef } from '../types';

/**
 * Sketch that paint should commit into when Session selection is exactly one Sketch.
 * Otherwise null → create-on-stroke / tool staging.
 *
 * When `nodes` is provided, a selected Sketch id that is missing from the Document
 * (e.g. after undo deleted the Node) is treated as no target — same as empty selection.
 */
export function resolvePaintSketchTarget(
  selection: ReadonlySet<NodeRef> | Iterable<NodeRef>,
  nodes?: Readonly<Record<string, Node>>,
): NodeId | null {
  const refs = selection instanceof Set ? selection : new Set(selection);
  if (refs.size !== 1) {
    return null;
  }
  const only = refs.values().next().value as NodeRef | undefined;
  if (only?.type !== 'sketch') {
    return null;
  }
  if (nodes) {
    const node = nodes[only.id];
    if (!node || node.type !== 'sketch') {
      return null;
    }
  }
  return only.id;
}
