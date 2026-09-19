import type { MotionTextAnimator, MotionTextLayer, MotionVec2, SupportedEasing } from "./types.ts";

export type MotionTextGlyphRun = {
  character: string;
  characterIndex: number;
  unitIndex: number;
  opacity: number;
  position: MotionVec2;
  scale: MotionVec2;
  rotation: number;
};

type TextUnit = {
  index: number;
  wordIndex: number;
  character: string;
};

export function hasEnabledMotionTextAnimators(layer: MotionTextLayer): boolean {
  return Boolean(layer.textAnimators?.some((animator) => animator.enabled));
}

export function getMotionTextAnimatorRuns(
  layer: MotionTextLayer,
  localTime: number,
): MotionTextGlyphRun[] {
  const units = splitTextUnits(layer.text);
  if (units.length === 0) return [];
  const animators = (layer.textAnimators ?? [])
    .filter((animator) => animator.enabled)
    .map(sanitizeMotionTextAnimator);

  const maxCharacterUnit = Math.max(0, units.length - 1);
  const maxWordUnit = Math.max(
    0,
    ...units.map((unit) => unit.wordIndex).filter((index) => index >= 0),
  );

  return units.map((unit) => {
    let opacity = 1;
    let positionX = 0;
    let positionY = 0;
    let scaleX = 1;
    let scaleY = 1;
    let rotation = 0;

    for (const animator of animators) {
      const basedOn = animator.selector.basedOn as string;
      const unitIndex = basedOn === "words" ? unit.wordIndex : unit.index;
      if (unitIndex < 0) continue;
      const unitCount = basedOn === "words" ? maxWordUnit + 1 : maxCharacterUnit + 1;
      if (!isUnitInsideSelector(unitIndex, unitCount, animator.selector)) continue;

      const progress = getAnimatorProgress(animator, unitIndex, unitCount, localTime);
      const inverse = 1 - progress;
      positionX += animator.properties.position.x * inverse;
      positionY += animator.properties.position.y * inverse;
      scaleX *= interpolate(animator.properties.scale.x, 1, progress);
      scaleY *= interpolate(animator.properties.scale.y, 1, progress);
      rotation += animator.properties.rotation * inverse;
      opacity *= interpolate(animator.properties.opacity, 1, progress);
    }

    return {
      character: unit.character,
      characterIndex: unit.index,
      unitIndex: unit.wordIndex >= 0 ? unit.wordIndex : unit.index,
      opacity: clamp(opacity, 0, 1),
      position: { x: positionX, y: positionY },
      scale: { x: scaleX, y: scaleY },
      rotation,
    };
  });
}

export function splitTextRunsIntoLines(runs: readonly MotionTextGlyphRun[]): MotionTextGlyphRun[][] {
  const lines: MotionTextGlyphRun[][] = [[]];
  for (const run of runs) {
    if (run.character === "\n") {
      lines.push([]);
    } else {
      lines[lines.length - 1].push(run);
    }
  }
  return lines;
}

export function sanitizeMotionTextAnimator(animator: MotionTextAnimator): MotionTextAnimator {
  return {
    ...animator,
    selector: {
      ...animator.selector,
      basedOn: animator.selector.basedOn,
      start: clamp(animator.selector.start, 0, 100),
      end: clamp(animator.selector.end, 0, 100),
      offset: finite(animator.selector.offset, 0),
    },
    timing: {
      ...animator.timing,
      startTime: Math.max(0, finite(animator.timing.startTime, 0)),
      duration: Math.max(0.001, finite(animator.timing.duration, 0.45)),
      stagger: Math.max(0, finite(animator.timing.stagger, 0.035)),
      direction: animator.timing.direction,
      easing: animator.timing.easing,
    },
    properties: {
      ...animator.properties,
      position: {
        x: finite(animator.properties.position.x, 0),
        y: finite(animator.properties.position.y, 0),
      },
      scale: {
        x: Math.max(0.001, finite(animator.properties.scale.x, 1)),
        y: Math.max(0.001, finite(animator.properties.scale.y, 1)),
      },
      rotation: finite(animator.properties.rotation, 0),
      opacity: clamp(animator.properties.opacity, 0, 1),
    },
  };
}

function splitTextUnits(text: string): TextUnit[] {
  const characters = Array.from(text);
  let wordIndex = -1;
  let inWord = false;
  return characters.map((character, index) => {
    if (/\s/u.test(character)) {
      inWord = false;
      return { index, wordIndex: -1, character };
    }
    if (!inWord) {
      wordIndex += 1;
      inWord = true;
    }
    return { index, wordIndex, character };
  });
}

function getAnimatorProgress(
  animator: MotionTextAnimator,
  unitIndex: number,
  unitCount: number,
  localTime: number,
): number {
  const order = getDirectionalUnitOrder(unitIndex, unitCount, animator.timing.direction);
  const startTime = animator.timing.startTime + order * animator.timing.stagger;
  const duration = Math.max(0.001, animator.timing.duration);
  const raw = (Math.max(0, localTime) - startTime) / duration;
  return ease(clamp(raw, 0, 1), animator.timing.easing);
}

function getDirectionalUnitOrder(unitIndex: number, unitCount: number, direction: string): number {
  if (direction === "reverse") return Math.max(0, unitCount - 1 - unitIndex);
  if (direction === "center") {
    const center = (Math.max(1, unitCount) - 1) / 2;
    return Math.abs(unitIndex - center);
  }
  return unitIndex;
}

function isUnitInsideSelector(
  unitIndex: number,
  unitCount: number,
  selector: MotionTextAnimator["selector"],
): boolean {
  if (unitCount <= 0) return false;
  const rawStart = clamp(selector.start, 0, 100);
  const rawEnd = clamp(selector.end, 0, 100);
  if (rawStart === 0 && rawEnd === 100) return true;
  const position = normalizePercent(((unitIndex + 0.5) / unitCount) * 100 - selector.offset);
  const start = normalizePercent(rawStart);
  const end = normalizePercent(rawEnd);
  if (start === end) return false;
  if (start < end) return position >= start && position <= end;
  return position >= start || position <= end;
}

function ease(value: number, easing: SupportedEasing): number {
  switch (easing) {
    case "ease-in":
      return value * value;
    case "ease-out":
      return 1 - (1 - value) * (1 - value);
    case "ease":
      return value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;
    case "linear":
    default:
      return value;
  }
}

function interpolate(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function normalizePercent(value: number): number {
  return ((finite(value, 0) % 100) + 100) % 100;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value, min)));
}
