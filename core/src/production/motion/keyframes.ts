import type { MotionKeyframe, MotionTransform2D, SupportedEasing } from "./types.ts";

export function applyNamedEasing(t: number, easing: SupportedEasing): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "ease-in":
      return clamped * clamped;
    case "ease-out":
      return clamped * (2 - clamped);
    case "ease":
      return cubicBezierEase(clamped, 0.25, 0.1, 0.25, 1);
    case "linear":
    default:
      return clamped;
  }
}

export function evaluateKeyframeValue(
  keyframes: readonly MotionKeyframe[],
  property: string,
  localTime: number,
  fallback: number,
): number {
  const time = Math.max(0, localTime);
  const matching = keyframes.filter((keyframe) => keyframe.property === property);
  if (matching.length === 0) return fallback;
  const sorted = [...matching].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) return sorted[0].value;
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

  let start = sorted[0];
  let end = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (time >= sorted[i].time && time <= sorted[i + 1].time) {
      start = sorted[i];
      end = sorted[i + 1];
      break;
    }
  }
  const duration = end.time - start.time;
  const linear = duration > 0 ? (time - start.time) / duration : 0;
  const progress = applyNamedEasing(linear, start.easing);
  return start.value + (end.value - start.value) * progress;
}

export function getMotionTransformAtTime(
  base: MotionTransform2D,
  keyframes: readonly MotionKeyframe[],
  localTime: number,
): MotionTransform2D {
  const value = (property: string, fallback: number): number =>
    evaluateKeyframeValue(keyframes, property, localTime, fallback);
  return {
    ...base,
    position: {
      x: value("transform.position.x", base.position.x),
      y: value("transform.position.y", base.position.y),
    },
    scale: {
      x: value("transform.scale.x", base.scale.x),
      y: value("transform.scale.y", base.scale.y),
    },
    rotation: value("transform.rotation", base.rotation),
    rotation3d: base.rotation3d
      ? {
          x: value("transform.rotation.x", base.rotation3d.x),
          y: value("transform.rotation.y", base.rotation3d.y),
          z: base.rotation3d.z,
        }
      : base.rotation3d,
    anchor: {
      x: value("transform.anchor.x", base.anchor.x),
      y: value("transform.anchor.y", base.anchor.y),
    },
    opacity: value("transform.opacity", base.opacity),
    perspective: value("transform.perspective", base.perspective ?? 1000),
    transformStyle: base.transformStyle,
  };
}

function cubicBezierEase(t: number, x1: number, y1: number, x2: number, y2: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let guess = t;
  for (let i = 0; i < 8; i += 1) {
    const current = sampleBezier(guess, x1, x2) - t;
    const derivative = sampleBezierDerivative(guess, x1, x2);
    if (Math.abs(derivative) < 1e-6) break;
    guess = Math.min(1, Math.max(0, guess - current / derivative));
  }
  return sampleBezier(guess, y1, y2);
}

function sampleBezier(t: number, a: number, b: number): number {
  return (((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t + 3 * a) * t;
}

function sampleBezierDerivative(t: number, a: number, b: number): number {
  return 3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;
}
