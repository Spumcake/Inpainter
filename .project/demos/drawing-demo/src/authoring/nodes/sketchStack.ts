import type { NodeId } from '../ids';
import type { SketchNode } from '../types';
import {
  computePeerStackOrdersToIndex,
  type PeerStackOrders,
} from './peerStack';

export type SketchStackAction = 'front' | 'forward' | 'backward' | 'back';

/** Dense ranks after a stack move (or null if no-op / missing target). */
export type SketchStackOrders = PeerStackOrders;

/**
 * Compute new contiguous stackOrder values (0 = bottom … n-1 = top).
 * `ordered` must already be sorted ascending by stackOrder.
 */
export function computeSketchStackOrders(
  ordered: readonly SketchNode[],
  sketchId: NodeId,
  action: SketchStackAction,
): SketchStackOrders | null {
  const fromIndex = ordered.findIndex((sketch) => sketch.id === sketchId);
  if (fromIndex < 0) {
    return null;
  }

  const last = ordered.length - 1;
  let toIndex = fromIndex;
  switch (action) {
    case 'front':
      toIndex = last;
      break;
    case 'forward':
      toIndex = Math.min(last, fromIndex + 1);
      break;
    case 'backward':
      toIndex = Math.max(0, fromIndex - 1);
      break;
    case 'back':
      toIndex = 0;
      break;
  }

  return computePeerStackOrdersToIndex(ordered, sketchId, toIndex);
}

/** Absolute move within the ascending Sketch stack (Outliner drag). */
export function computeSketchStackOrdersToIndex(
  ordered: readonly SketchNode[],
  sketchId: NodeId,
  toIndex: number,
): SketchStackOrders | null {
  return computePeerStackOrdersToIndex(ordered, sketchId, toIndex);
}

/** Whether a stack action would change order for the target Sketch. */
export function canReorderSketchStack(
  ordered: readonly SketchNode[],
  sketchId: NodeId,
  action: SketchStackAction,
): boolean {
  return computeSketchStackOrders(ordered, sketchId, action) != null;
}

export function sketchStackActionLabel(action: SketchStackAction): string {
  switch (action) {
    case 'front':
      return 'Bring sketch to front';
    case 'forward':
      return 'Bring sketch forward';
    case 'backward':
      return 'Send sketch backward';
    case 'back':
      return 'Send sketch to back';
  }
}
