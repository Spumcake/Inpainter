import { imageRect } from '../document/selectors';
import type { NodeId } from '../ids';
import type {
  DocumentState,
  FrameNode,
  ImageNode,
  Node,
  OutputNode,
  Rect,
  ContainerNode,
  SketchNode,
} from '../types';

export type AspectRatio = { w: number; h: number };

export function parseAspectRatio(raw: string): AspectRatio {
  const match = /^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/i.exec(
    raw.trim(),
  );
  if (!match) {
    return { w: 1, h: 1 };
  }
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return { w: 1, h: 1 };
  }
  return { w, h };
}

/**
 * Cover-fit size of `host` under `aspect` (= 100% Output base).
 * Fully covers the host AABB while locking Output aspect.
 */
export function outputCoverBaseSize(
  host: Rect,
  aspect: AspectRatio,
): { width: number; height: number } {
  const hostW = Math.max(1, host.width);
  const hostH = Math.max(1, host.height);
  const hostAspect = hostW / hostH;
  const outAspect = aspect.w / aspect.h;
  if (outAspect >= hostAspect) {
    // Output wider than host: match height, expand width.
    const height = hostH;
    const width = height * outAspect;
    return { width, height };
  }
  const width = hostW;
  const height = width / outAspect;
  return { width, height };
}

/** Absolute Canvas rect: cover base × relativeScale, centered on host. */
export function outputRectFromHost(
  host: Rect,
  aspect: AspectRatio,
  relativeScale: number,
): Rect {
  const scale = Math.max(0.01, relativeScale);
  const base = outputCoverBaseSize(host, aspect);
  const width = Math.max(1, base.width * scale);
  const height = Math.max(1, base.height * scale);
  const cx = host.x + host.width / 2;
  const cy = host.y + host.height / 2;
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  };
}

/** Infer relativeScale from a display rect vs host (center ignored). */
export function relativeScaleFromDisplayRect(
  host: Rect,
  aspect: AspectRatio,
  display: Rect,
): number {
  const base = outputCoverBaseSize(host, aspect);
  if (base.width <= 0) return 1;
  return Math.max(0.01, display.width / base.width);
}

export function hostRectForOwner(
  state: DocumentState,
  ownerId: NodeId,
): Rect | null {
  const owner = state.nodes[ownerId];
  if (!owner) return null;
  if (owner.type === 'sketch' || owner.type === 'container') {
    return { ...owner.canvas };
  }
  if (owner.type === 'frame') {
    return { ...owner.crop };
  }
  if (owner.type === 'image') {
    if (owner.placement.kind !== 'canvas') {
      return null;
    }
    return imageRect(owner);
  }
  return null;
}

export function findOutputForOwner(
  state: DocumentState,
  ownerId: NodeId,
): OutputNode | null {
  for (const node of Object.values(state.nodes)) {
    if (node.type === 'output' && node.ownerId === ownerId) {
      return node;
    }
  }
  return null;
}

export function outputDisplayRect(
  state: DocumentState,
  output: OutputNode,
): Rect | null {
  const host = hostRectForOwner(state, output.ownerId);
  if (!host) return null;
  return outputRectFromHost(
    host,
    parseAspectRatio(output.ratio),
    output.relativeScale,
  );
}

export function isOutputOwnerNode(
  node: Node | undefined,
): node is SketchNode | ContainerNode | FrameNode | ImageNode {
  return (
    node?.type === 'sketch' ||
    node?.type === 'container' ||
    node?.type === 'frame' ||
    node?.type === 'image'
  );
}
