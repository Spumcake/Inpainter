import type { NodeId } from '../ids';

/** Item with durable peer stack order (0 = bottom … n−1 = top). */
export type PeerStackItem = {
  id: NodeId;
  stackOrder: number;
};

/** Dense ranks after a stack move (or null if no-op / missing target). */
export type PeerStackOrders = Map<NodeId, number>;

/**
 * Move `id` to `toIndex` within an ascending-by-stackOrder list.
 * Returns new contiguous stackOrder values, or null if no-op / missing.
 */
export function computePeerStackOrdersToIndex(
  ordered: readonly PeerStackItem[],
  id: NodeId,
  toIndex: number,
): PeerStackOrders | null {
  const fromIndex = ordered.findIndex((item) => item.id === id);
  if (fromIndex < 0) {
    return null;
  }

  const clamped = Math.max(0, Math.min(ordered.length - 1, toIndex));
  if (clamped === fromIndex) {
    return null;
  }

  const next = ordered.slice();
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) {
    return null;
  }
  next.splice(clamped, 0, moved);

  const orders: PeerStackOrders = new Map();
  next.forEach((item, index) => {
    orders.set(item.id, index);
  });
  return orders;
}

export function comparePeerStackOrder(
  a: PeerStackItem,
  b: PeerStackItem,
): number {
  if (a.stackOrder !== b.stackOrder) {
    return a.stackOrder - b.stackOrder;
  }
  return a.id.localeCompare(b.id);
}

export function nextPeerStackOrder(
  ordered: readonly PeerStackItem[],
): number {
  return ordered.length === 0
    ? 0
    : Math.max(...ordered.map((item) => item.stackOrder)) + 1;
}
