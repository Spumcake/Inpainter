export const SUPPORTED_KEYFRAME_PROPERTIES = ["transform.opacity", "transform.scale.x"] as const;
export type SupportedKeyframeProperty = (typeof SUPPORTED_KEYFRAME_PROPERTIES)[number];

export const SUPPORTED_EASINGS = ["linear", "ease", "ease-in", "ease-out"] as const;
export type SupportedEasing = (typeof SUPPORTED_EASINGS)[number];

export type MotionVec2 = {
  x: number;
  y: number;
};

export type MotionKeyframe = {
  id: string;
  time: number;
  property: SupportedKeyframeProperty;
  value: number;
  easing: SupportedEasing;
  [key: string]: unknown;
};

export type MotionTransform2D = {
  position: MotionVec2;
  scale: MotionVec2;
  rotation: number;
  anchor: MotionVec2;
  opacity: number;
  rotation3d?: { x: number; y: number; z?: number };
  perspective?: number;
  transformStyle?: string;
  [key: string]: unknown;
};

export type MotionSolidFill = {
  type: "solid";
  color: string;
  opacity: number;
  [key: string]: unknown;
};

export type MotionShapeStyle = {
  fill: MotionSolidFill;
  stroke?: { color: string; width: number; opacity: number; [key: string]: unknown };
  cornerRadius?: number;
  [key: string]: unknown;
};

export type MotionLayerBase = {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  visible: boolean;
  locked?: boolean;
  transform: MotionTransform2D;
  keyframes: MotionKeyframe[];
  [key: string]: unknown;
};

export type MotionShapeLayer = MotionLayerBase & {
  type: "shape";
  shapeType: "rectangle";
  width: number;
  height: number;
  style: MotionShapeStyle;
};

export type MotionTextAnimator = {
  id: string;
  name?: string;
  enabled: boolean;
  selector: {
    basedOn: "characters";
    start: number;
    end: number;
    offset: number;
    [key: string]: unknown;
  };
  timing: {
    startTime: number;
    duration: number;
    stagger: number;
    direction: string;
    easing: SupportedEasing;
    [key: string]: unknown;
  };
  properties: {
    position: MotionVec2;
    scale: MotionVec2;
    rotation: number;
    opacity: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type MotionTextLayer = MotionLayerBase & {
  type: "text";
  text: string;
  textAnimators: MotionTextAnimator[];
  style: {
    fontFamily: string;
    fontSize: number;
    fontWeight?: string | number;
    color: string;
    align?: string;
    lineHeight?: number;
    [key: string]: unknown;
  };
};

export type MotionLayer = MotionShapeLayer | MotionTextLayer;

export type MotionComposition = {
  id: string;
  name?: string;
  width: number;
  height: number;
  frameRate: number;
  duration: number;
  backgroundColor: string;
  layers: MotionLayer[];
  [key: string]: unknown;
};

export type MotionInstance = {
  id: string;
  compositionId: string;
  name?: string;
  trackId?: string;
  startTime: number;
  duration: number;
  transform: MotionTransform2D & { fitMode?: string };
  opacity: number;
  [key: string]: unknown;
};

export type SupportedMotionScene = {
  composition: MotionComposition;
  instance: MotionInstance;
};

export type ResolvedLayerAtTime = {
  id: string;
  localTime: number;
  active: boolean;
};

export type ResolvedCompositionAtTime = {
  composition: MotionComposition;
  compositionLocalTime: number;
  layers: readonly ResolvedLayerAtTime[];
};

export type ResolvedInstanceAtTime = ResolvedCompositionAtTime & {
  instance: MotionInstance;
  projectTime: number;
  instanceActive: boolean;
  trackHidden: boolean;
};
