export type {
  MotionComposition,
  MotionInstance,
  MotionKeyframe,
  MotionLayer,
  MotionShapeLayer,
  MotionTextAnimator,
  MotionTextLayer,
  MotionTransform2D,
  MotionVec2,
  ResolvedCompositionAtTime,
  ResolvedInstanceAtTime,
  ResolvedLayerAtTime,
  SupportedEasing,
  SupportedKeyframeProperty,
  SupportedMotionScene,
} from "./types.ts";
export {
  SUPPORTED_EASINGS,
  SUPPORTED_KEYFRAME_PROPERTIES,
} from "./types.ts";
export { validateMotionSupport } from "./support.ts";
export {
  findMotionComposition,
  findMotionInstance,
  findMotionKeyframe,
  findMotionLayer,
  isIntervalActive,
  resolveCompositionAtTime,
  resolveCompositionDirect,
  resolveInstanceAtTime,
} from "./resolve.ts";
export { applyNamedEasing, evaluateKeyframeValue, getMotionTransformAtTime } from "./keyframes.ts";
export {
  getMotionTextAnimatorRuns,
  hasEnabledMotionTextAnimators,
  sanitizeMotionTextAnimator,
  splitTextRunsIntoLines,
} from "./text-animators.ts";
export type { MotionTextGlyphRun } from "./text-animators.ts";
