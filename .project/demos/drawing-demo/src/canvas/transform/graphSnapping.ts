import type { Rect } from '../../authoring/types';
import type { ResizeEdge } from './resizeMath';

type SnapRect = Rect & {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type SnapAxis = 'vertical' | 'horizontal';
type SnapEdge = 'left' | 'right' | 'top' | 'bottom';

export type AlignmentGuide = {
  orientation: 'vertical' | 'horizontal';
  position: number;
  spanStart: number;
  spanEnd: number;
};

export type SnapGuideState = {
  alignment: AlignmentGuide[];
};

export type GraphSnapOptions = {
  zoom?: number;
  snapThreshold?: number;
  maxElementDistance?: number;
};

export type GraphSnapResult = {
  bounds: Rect;
  guides: SnapGuideState;
  snappedX: boolean;
  snappedY: boolean;
};

export type GroupMoveSnapResult = GraphSnapResult & {
  deltaX: number;
  deltaY: number;
};

const DEFAULT_SNAP_THRESHOLD = 5;

const emptyGuides = (): SnapGuideState => ({ alignment: [] });

const toSnapRect = (bounds: Rect): SnapRect => ({
  ...bounds,
  left: bounds.x,
  right: bounds.x + bounds.width,
  top: bounds.y,
  bottom: bounds.y + bounds.height,
});

export const thresholdForZoom = (
  zoom: number,
  snapThreshold = DEFAULT_SNAP_THRESHOLD,
): number => snapThreshold / Math.max(zoom, 0.01);

const thresholdFromOptions = (options: GraphSnapOptions) =>
  thresholdForZoom(options.zoom ?? 1, options.snapThreshold);

const withinElementDistance = (a: SnapRect, b: SnapRect, maxDistance: number) => {
  const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
  const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
  return Math.hypot(dx, dy) <= maxDistance;
};

const buildAxisGuides = (candidates: SnapRect[], orientation: SnapAxis): AxisGuide[] =>
  orientation === 'vertical'
    ? candidates.flatMap((candidate) => [
        { position: candidate.left, edge: 'left' as const, candidate },
        { position: candidate.right, edge: 'right' as const, candidate },
      ])
    : candidates.flatMap((candidate) => [
        { position: candidate.top, edge: 'top' as const, candidate },
        { position: candidate.bottom, edge: 'bottom' as const, candidate },
      ]);

type AxisSnapMatch = {
  offset: number;
  guidePos: number;
  dist: number;
  spanStart: number;
  spanEnd: number;
  orientation: SnapAxis;
  targetEdge: SnapEdge;
  candidateEdge: SnapEdge;
  candidate: SnapRect;
};

type AxisTarget = {
  position: number;
  edge: SnapEdge;
};

type AxisGuide = {
  position: number;
  edge: SnapEdge;
  candidate: SnapRect;
};

const nearestAxisSnap = (
  targetPoints: AxisTarget[],
  guides: AxisGuide[],
  threshold: number,
  targetRect: SnapRect,
  orientation: SnapAxis,
): AxisSnapMatch | null => {
  let best: AxisSnapMatch | null = null;
  for (const target of targetPoints) {
    for (const guide of guides) {
      const offset = guide.position - target.position;
      const dist = Math.abs(offset);
      if (dist <= threshold && (!best || dist < best.dist)) {
        best =
          orientation === 'vertical'
            ? {
                offset,
                guidePos: guide.position,
                dist,
                spanStart: Math.min(targetRect.top, guide.candidate.top),
                spanEnd: Math.max(targetRect.bottom, guide.candidate.bottom),
                orientation,
                targetEdge: target.edge,
                candidateEdge: guide.edge,
                candidate: guide.candidate,
              }
            : {
                offset,
                guidePos: guide.position,
                dist,
                spanStart: Math.min(targetRect.left, guide.candidate.left),
                spanEnd: Math.max(targetRect.right, guide.candidate.right),
                orientation,
                targetEdge: target.edge,
                candidateEdge: guide.edge,
                candidate: guide.candidate,
              };
      }
    }
  }
  return best;
};

const computeAlignmentSnapX = (
  target: SnapRect,
  candidates: SnapRect[],
  threshold: number,
  maxElementDistance: number,
): AxisSnapMatch | null => {
  const filtered = candidates.filter((candidate) =>
    withinElementDistance(target, candidate, maxElementDistance),
  );
  return nearestAxisSnap(
    [
      { position: target.left, edge: 'left' },
      { position: target.right, edge: 'right' },
    ],
    buildAxisGuides(filtered, 'vertical'),
    threshold,
    target,
    'vertical',
  );
};

const computeAlignmentSnapY = (
  target: SnapRect,
  candidates: SnapRect[],
  threshold: number,
  maxElementDistance: number,
): AxisSnapMatch | null => {
  const filtered = candidates.filter((candidate) =>
    withinElementDistance(target, candidate, maxElementDistance),
  );
  return nearestAxisSnap(
    [
      { position: target.top, edge: 'top' },
      { position: target.bottom, edge: 'bottom' },
    ],
    buildAxisGuides(filtered, 'horizontal'),
    threshold,
    target,
    'horizontal',
  );
};

const finalizeMoveSnap = (
  proposed: Rect,
  candidates: SnapRect[],
  options: GraphSnapOptions,
): GraphSnapResult => {
  const threshold = thresholdFromOptions(options);
  const maxElementDistance = options.maxElementDistance ?? Infinity;
  const target = toSnapRect(proposed);
  const guides = emptyGuides();

  const alignX = computeAlignmentSnapX(target, candidates, threshold, maxElementDistance);
  const alignY = computeAlignmentSnapY(target, candidates, threshold, maxElementDistance);

  let offsetX = 0;
  let offsetY = 0;
  let snappedX = false;
  let snappedY = false;

  if (alignX) {
    offsetX = alignX.offset;
    snappedX = true;
    guides.alignment.push({
      orientation: 'vertical',
      position: alignX.guidePos,
      spanStart: alignX.spanStart,
      spanEnd: alignX.spanEnd,
    });
  }

  if (alignY) {
    offsetY = alignY.offset;
    snappedY = true;
    guides.alignment.push({
      orientation: 'horizontal',
      position: alignY.guidePos,
      spanStart: alignY.spanStart,
      spanEnd: alignY.spanEnd,
    });
  }

  const snappedBounds = { ...proposed, x: proposed.x + offsetX, y: proposed.y + offsetY };

  return {
    bounds: snappedBounds,
    guides,
    snappedX,
    snappedY,
  };
};

export const emptySnapGuides = emptyGuides;

export const computeMoveSnap = (
  proposed: Rect,
  candidates: readonly Rect[],
  options: GraphSnapOptions = {},
): GraphSnapResult =>
  finalizeMoveSnap(proposed, candidates.map(toSnapRect), options);

export const computeGroupMoveSnap = (
  starts: readonly Rect[],
  dx: number,
  dy: number,
  candidates: readonly Rect[],
  options: GraphSnapOptions = {},
): GroupMoveSnapResult => {
  if (!starts.length) {
    return {
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      guides: emptyGuides(),
      snappedX: false,
      snappedY: false,
      deltaX: 0,
      deltaY: 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const start of starts) {
    const x = start.x + dx;
    const y = start.y + dy;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + start.width);
    maxY = Math.max(maxY, y + start.height);
  }

  const groupBounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  const result = finalizeMoveSnap(groupBounds, candidates.map(toSnapRect), options);
  return {
    ...result,
    deltaX: result.bounds.x - groupBounds.x,
    deltaY: result.bounds.y - groupBounds.y,
  };
};

type ResizeAnchor = { x: number; y: number };

const anchorForResizeEdge = (edge: ResizeEdge, start: Rect): ResizeAnchor => {
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  const movesWest = edge === 'w';
  const movesNorth = edge === 'n';
  return {
    x: movesWest ? right : start.x,
    y: movesNorth ? bottom : start.y,
  };
};

const boundsFromResizeAnchor = (
  edge: ResizeEdge,
  anchor: ResizeAnchor,
  width: number,
  height: number,
): Rect => {
  const movesWest = edge === 'w';
  const movesNorth = edge === 'n';
  return {
    x: movesWest ? anchor.x - width : anchor.x,
    y: movesNorth ? anchor.y - height : anchor.y,
    width,
    height,
  };
};

/** Aspect-locked resize: snap moving edges while keeping the drag-start anchor fixed. */
export const computeAspectLockedResizeSnap = (
  raw: Rect,
  edge: ResizeEdge,
  start: Rect,
  candidates: readonly Rect[],
  options: GraphSnapOptions = {},
): GraphSnapResult => {
  const threshold = thresholdFromOptions(options);
  const aspect = start.height / Math.max(start.width, 1);
  const guides = emptyGuides();
  const rect = toSnapRect(raw);
  const anchor = anchorForResizeEdge(edge, start);
  const snapCandidates = candidates.map(toSnapRect);
  const verticalGuides = buildAxisGuides(snapCandidates, 'vertical');
  const horizontalGuides = buildAxisGuides(snapCandidates, 'horizontal');

  type SnapOption = { dist: number; bounds: Rect; match: AxisSnapMatch };
  const options_: SnapOption[] = [];

  const pushWidthSnap = (match: AxisSnapMatch, width: number) => {
    if (width <= 0) return;
    const height = width * aspect;
    options_.push({
      dist: match.dist,
      bounds: boundsFromResizeAnchor(edge, anchor, width, height),
      match,
    });
  };

  const pushHeightSnap = (match: AxisSnapMatch, height: number) => {
    if (height <= 0) return;
    const width = height / aspect;
    options_.push({
      dist: match.dist,
      bounds: boundsFromResizeAnchor(edge, anchor, width, height),
      match,
    });
  };

  if (edge === 'e') {
    const match = nearestAxisSnap(
      [{ position: rect.right, edge: 'right' }],
      verticalGuides,
      threshold,
      rect,
      'vertical',
    );
    if (match) pushWidthSnap(match, match.guidePos - anchor.x);
  } else if (edge === 'w') {
    const match = nearestAxisSnap(
      [{ position: rect.left, edge: 'left' }],
      verticalGuides,
      threshold,
      rect,
      'vertical',
    );
    if (match) pushWidthSnap(match, anchor.x - match.guidePos);
  }

  if (edge === 's') {
    const match = nearestAxisSnap(
      [{ position: rect.bottom, edge: 'bottom' }],
      horizontalGuides,
      threshold,
      rect,
      'horizontal',
    );
    if (match) pushHeightSnap(match, match.guidePos - anchor.y);
  } else if (edge === 'n') {
    const match = nearestAxisSnap(
      [{ position: rect.top, edge: 'top' }],
      horizontalGuides,
      threshold,
      rect,
      'horizontal',
    );
    if (match) pushHeightSnap(match, anchor.y - match.guidePos);
  }

  if (!options_.length) {
    return { bounds: raw, guides, snappedX: false, snappedY: false };
  }

  const best = options_.reduce((winner, option) =>
    option.dist < winner.dist ? option : winner,
  );
  guides.alignment.push({
    orientation: best.match.orientation,
    position: best.match.guidePos,
    spanStart: best.match.spanStart,
    spanEnd: best.match.spanEnd,
  });

  return {
    bounds: best.bounds,
    guides,
    snappedX: best.match.orientation === 'vertical',
    snappedY: best.match.orientation === 'horizontal',
  };
};

const boundsFromCreateCorner = (
  start: { x: number; y: number },
  leftAnchored: boolean,
  topAnchored: boolean,
  width: number,
  height: number,
): Rect => ({
  x: leftAnchored ? start.x : start.x - width,
  y: topAnchored ? start.y : start.y - height,
  width,
  height,
});

/**
 * Snap a drag-to-create rect.
 * 1) Position-snap anchored edges first (align origin to peer tops/sides).
 * 2) Size-snap free edges from that adjusted origin (aspect locked).
 * Origin alignment is preserved when size snap engages.
 */
export const computeCreateRectSnap = (
  raw: Rect,
  start: { x: number; y: number },
  candidates: readonly Rect[],
  options: GraphSnapOptions = {},
): GraphSnapResult => {
  const threshold = thresholdFromOptions(options);
  const aspect = raw.height / Math.max(raw.width, 1);
  const guides = emptyGuides();
  const snapCandidates = candidates.map(toSnapRect);
  const verticalGuides = buildAxisGuides(snapCandidates, 'vertical');
  const horizontalGuides = buildAxisGuides(snapCandidates, 'horizontal');

  const leftAnchored = Math.abs(raw.x - start.x) <= 1e-6;
  const topAnchored = Math.abs(raw.y - start.y) <= 1e-6;

  let bounds = { ...raw };
  let effectiveStart = { ...start };
  let snappedX = false;
  let snappedY = false;

  // 1) Align the drag origin before any size snap.
  const originRect = toSnapRect(bounds);
  const anchoredX = leftAnchored
    ? nearestAxisSnap(
        [{ position: originRect.left, edge: 'left' }],
        verticalGuides,
        threshold,
        originRect,
        'vertical',
      )
    : nearestAxisSnap(
        [{ position: originRect.right, edge: 'right' }],
        verticalGuides,
        threshold,
        originRect,
        'vertical',
      );
  if (anchoredX) {
    bounds = { ...bounds, x: bounds.x + anchoredX.offset };
    effectiveStart = { ...effectiveStart, x: effectiveStart.x + anchoredX.offset };
    snappedX = true;
    guides.alignment.push({
      orientation: 'vertical',
      position: anchoredX.guidePos,
      spanStart: anchoredX.spanStart,
      spanEnd: anchoredX.spanEnd,
    });
  }

  const originAfterX = toSnapRect(bounds);
  const anchoredY = topAnchored
    ? nearestAxisSnap(
        [{ position: originAfterX.top, edge: 'top' }],
        horizontalGuides,
        threshold,
        originAfterX,
        'horizontal',
      )
    : nearestAxisSnap(
        [{ position: originAfterX.bottom, edge: 'bottom' }],
        horizontalGuides,
        threshold,
        originAfterX,
        'horizontal',
      );
  if (anchoredY) {
    bounds = { ...bounds, y: bounds.y + anchoredY.offset };
    effectiveStart = { ...effectiveStart, y: effectiveStart.y + anchoredY.offset };
    snappedY = true;
    guides.alignment.push({
      orientation: 'horizontal',
      position: anchoredY.guidePos,
      spanStart: anchoredY.spanStart,
      spanEnd: anchoredY.spanEnd,
    });
  }

  // 2) Size-snap free edges from the aligned origin (keeps top-left/etc.).
  const rect = toSnapRect(bounds);
  type SizeOption = { dist: number; bounds: Rect; match: AxisSnapMatch };
  const sizeOptions: SizeOption[] = [];

  const pushWidthSnap = (match: AxisSnapMatch, width: number) => {
    if (width <= 0) return;
    const height = width * aspect;
    sizeOptions.push({
      dist: match.dist,
      bounds: boundsFromCreateCorner(
        effectiveStart,
        leftAnchored,
        topAnchored,
        width,
        height,
      ),
      match,
    });
  };

  const pushHeightSnap = (match: AxisSnapMatch, height: number) => {
    if (height <= 0) return;
    const width = height / aspect;
    sizeOptions.push({
      dist: match.dist,
      bounds: boundsFromCreateCorner(
        effectiveStart,
        leftAnchored,
        topAnchored,
        width,
        height,
      ),
      match,
    });
  };

  if (leftAnchored) {
    const match = nearestAxisSnap(
      [{ position: rect.right, edge: 'right' }],
      verticalGuides,
      threshold,
      rect,
      'vertical',
    );
    if (match) pushWidthSnap(match, match.guidePos - effectiveStart.x);
  } else {
    const match = nearestAxisSnap(
      [{ position: rect.left, edge: 'left' }],
      verticalGuides,
      threshold,
      rect,
      'vertical',
    );
    if (match) pushWidthSnap(match, effectiveStart.x - match.guidePos);
  }

  if (topAnchored) {
    const match = nearestAxisSnap(
      [{ position: rect.bottom, edge: 'bottom' }],
      horizontalGuides,
      threshold,
      rect,
      'horizontal',
    );
    if (match) pushHeightSnap(match, match.guidePos - effectiveStart.y);
  } else {
    const match = nearestAxisSnap(
      [{ position: rect.top, edge: 'top' }],
      horizontalGuides,
      threshold,
      rect,
      'horizontal',
    );
    if (match) pushHeightSnap(match, effectiveStart.y - match.guidePos);
  }

  if (sizeOptions.length) {
    const best = sizeOptions.reduce((winner, option) =>
      option.dist < winner.dist ? option : winner,
    );
    bounds = best.bounds;
    if (best.match.orientation === 'vertical') snappedX = true;
    if (best.match.orientation === 'horizontal') snappedY = true;
    guides.alignment.push({
      orientation: best.match.orientation,
      position: best.match.guidePos,
      spanStart: best.match.spanStart,
      spanEnd: best.match.spanEnd,
    });
  }

  return { bounds, guides, snappedX, snappedY };
};
