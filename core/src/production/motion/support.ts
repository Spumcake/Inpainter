import { CoreError } from "../../errors.ts";
import type { ProductionDocument, TimelineClip, Track } from "../types.ts";
import {
  SUPPORTED_EASINGS,
  SUPPORTED_KEYFRAME_PROPERTIES,
  type MotionComposition,
  type MotionInstance,
  type MotionKeyframe,
  type MotionLayer,
  type MotionShapeLayer,
  type MotionTextAnimator,
  type MotionTextLayer,
  type MotionTransform2D,
  type MotionVec2,
  type SupportedEasing,
  type SupportedKeyframeProperty,
  type SupportedMotionScene,
} from "./types.ts";

function fail(message: string): never {
  throw new CoreError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} is not finite`);
  }
  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value) {
    fail(`${path} is missing required field`);
  }
  return value;
}

function rejectVisibleStroke(stroke: Record<string, unknown>, path: string): void {
  requiredString(stroke.color, `${path}.color`);
  const width = finiteNumber(stroke.width, `${path}.width`);
  const opacity = finiteNumber(stroke.opacity, `${path}.opacity`);
  if (width > 0 && opacity > 0) {
    fail(`Unsupported motion content at ${path}`);
  }
}

function requireAbsentOrEmptyArray(record: Record<string, unknown>, key: string, path: string): void {
  if (!(key in record)) return;
  const value = record[key];
  if (!Array.isArray(value)) {
    fail(`Unsupported motion content at ${path}.${key}`);
  }
  if (value.length > 0) {
    fail(`Unsupported motion content at ${path}.${key}`);
  }
}

function requireAbsent(record: Record<string, unknown>, key: string, path: string): void {
  if (key in record && record[key] !== undefined && record[key] !== null) {
    fail(`Unsupported motion content at ${path}.${key}`);
  }
}

function parseVec2(value: unknown, path: string): MotionVec2 {
  if (!isRecord(value)) {
    fail(`${path} is missing required field`);
  }
  return {
    x: finiteNumber(value.x, `${path}.x`),
    y: finiteNumber(value.y, `${path}.y`),
  };
}

function parseTransform(value: unknown, path: string): MotionTransform2D {
  if (!isRecord(value)) {
    fail(`${path} is missing required field`);
  }
  const rotation3d = value.rotation3d;
  if (rotation3d !== undefined) {
    if (!isRecord(rotation3d)) {
      fail(`Unsupported motion content at ${path}.rotation3d`);
    }
    const x = finiteNumber(rotation3d.x ?? 0, `${path}.rotation3d.x`);
    const y = finiteNumber(rotation3d.y ?? 0, `${path}.rotation3d.y`);
    const z = rotation3d.z === undefined ? 0 : finiteNumber(rotation3d.z, `${path}.rotation3d.z`);
    if (x !== 0 || y !== 0 || z !== 0) {
      fail(`Unsupported motion content at ${path}.rotation3d`);
    }
  }
  if (value.transformStyle !== undefined && value.transformStyle !== "flat") {
    fail(`Unsupported motion content at ${path}.transformStyle`);
  }
  if (value.perspective !== undefined && finiteNumber(value.perspective, `${path}.perspective`) !== 1000) {
    fail(`Unsupported motion content at ${path}.perspective`);
  }
  if (value.z !== undefined && finiteNumber(value.z, `${path}.z`) !== 0) {
    fail(`Unsupported motion content at ${path}.z`);
  }
  if (isRecord(value.position) && value.position.z !== undefined && finiteNumber(value.position.z, `${path}.position.z`) !== 0) {
    fail(`Unsupported motion content at ${path}.position.z`);
  }
  parseVec2(value.position, `${path}.position`);
  parseVec2(value.scale, `${path}.scale`);
  parseVec2(value.anchor, `${path}.anchor`);
  finiteNumber(value.rotation, `${path}.rotation`);
  finiteNumber(value.opacity, `${path}.opacity`);
  return value as MotionTransform2D;
}

function parseEasing(value: unknown, path: string): SupportedEasing {
  if (typeof value !== "string" || !(SUPPORTED_EASINGS as readonly string[]).includes(value)) {
    fail(`Unsupported motion content at ${path}`);
  }
  return value as SupportedEasing;
}

function parseKeyframe(value: unknown, path: string, seenIds: Set<string>): MotionKeyframe {
  if (!isRecord(value)) {
    fail(`${path} is not a valid keyframe`);
  }
  const id = requiredString(value.id, `${path}.id`);
  if (seenIds.has(id)) {
    fail(`Duplicate motion id at ${path}.id: ${id}`);
  }
  seenIds.add(id);
  const property = requiredString(value.property, `${path}.property`);
  if (!(SUPPORTED_KEYFRAME_PROPERTIES as readonly string[]).includes(property)) {
    fail(`Unsupported motion content at ${path}.property`);
  }
  finiteNumber(value.time, `${path}.time`);
  finiteNumber(value.value, `${path}.value`);
  parseEasing(value.easing, `${path}.easing`);
  return value as MotionKeyframe;
}

function parseAnimator(value: unknown, path: string, seenIds: Set<string>): MotionTextAnimator {
  if (!isRecord(value)) {
    fail(`${path} is not a valid text animator`);
  }
  if ("shader" in value && value.shader !== undefined && value.shader !== null) {
    fail(`Unsupported motion content at ${path}.shader`);
  }
  const id = requiredString(value.id, `${path}.id`);
  if (seenIds.has(id)) {
    fail(`Duplicate motion id at ${path}.id: ${id}`);
  }
  seenIds.add(id);
  if (typeof value.enabled !== "boolean") {
    fail(`${path}.enabled is missing required field`);
  }
  if (!isRecord(value.selector)) {
    fail(`${path}.selector is missing required field`);
  }
  if (value.selector.basedOn !== "characters") {
    fail(`Unsupported motion content at ${path}.selector.basedOn`);
  }
  finiteNumber(value.selector.start, `${path}.selector.start`);
  finiteNumber(value.selector.end, `${path}.selector.end`);
  finiteNumber(value.selector.offset, `${path}.selector.offset`);
  if (!isRecord(value.timing)) {
    fail(`${path}.timing is missing required field`);
  }
  finiteNumber(value.timing.startTime, `${path}.timing.startTime`);
  finiteNumber(value.timing.duration, `${path}.timing.duration`);
  finiteNumber(value.timing.stagger, `${path}.timing.stagger`);
  if (typeof value.timing.direction !== "string" || !value.timing.direction) {
    fail(`${path}.timing.direction is missing required field`);
  }
  parseEasing(value.timing.easing, `${path}.timing.easing`);
  if (!isRecord(value.properties)) {
    fail(`${path}.properties is missing required field`);
  }
  parseVec2(value.properties.position, `${path}.properties.position`);
  parseVec2(value.properties.scale, `${path}.properties.scale`);
  finiteNumber(value.properties.rotation, `${path}.properties.rotation`);
  finiteNumber(value.properties.opacity, `${path}.properties.opacity`);
  return value as MotionTextAnimator;
}

function parseLayer(value: unknown, path: string, seenIds: Set<string>): MotionLayer {
  if (!isRecord(value)) {
    fail(`${path} is not a valid motion layer`);
  }
  const id = requiredString(value.id, `${path}.id`);
  if (seenIds.has(id)) {
    fail(`Duplicate motion id at ${path}.id: ${id}`);
  }
  seenIds.add(id);
  requiredString(value.name, `${path}.name`);
  const type = requiredString(value.type, `${path}.type`);
  finiteNumber(value.startTime, `${path}.startTime`);
  finiteNumber(value.duration, `${path}.duration`);
  if (typeof value.visible !== "boolean") {
    fail(`${path}.visible is missing required field`);
  }
  parseTransform(value.transform, `${path}.transform`);
  if (!Array.isArray(value.keyframes)) {
    fail(`${path}.keyframes is missing required field`);
  }
  for (const [index, keyframe] of value.keyframes.entries()) {
    parseKeyframe(keyframe, `${path}.keyframes[${index}]`, seenIds);
  }
  requireAbsentOrEmptyArray(value, "effects", path);
  requireAbsentOrEmptyArray(value, "masks", path);
  requireAbsentOrEmptyArray(value, "expressions", path);
  requireAbsentOrEmptyArray(value, "contents", path);
  requireAbsentOrEmptyArray(value, "modifiers", path);
  requireAbsent(value, "trackMatte", path);
  requireAbsent(value, "motionBlur", path);
  requireAbsent(value, "blendMode", path);
  requireAbsent(value, "parentId", path);
  requireAbsent(value, "assetId", path);

  if (type === "shape") {
    if (value.shapeType !== "rectangle") {
      fail(`Unsupported motion content at ${path}.shapeType`);
    }
    finiteNumber(value.width, `${path}.width`);
    finiteNumber(value.height, `${path}.height`);
    if (!isRecord(value.style)) {
      fail(`${path}.style is missing required field`);
    }
    if (!isRecord(value.style.fill) || value.style.fill.type !== "solid") {
      fail(`Unsupported motion content at ${path}.style.fill`);
    }
    requiredString(value.style.fill.color, `${path}.style.fill.color`);
    finiteNumber(value.style.fill.opacity, `${path}.style.fill.opacity`);
    if (value.style.cornerRadius !== undefined) {
      finiteNumber(value.style.cornerRadius, `${path}.style.cornerRadius`);
    }
    if (isRecord(value.style.stroke)) {
      rejectVisibleStroke(value.style.stroke, `${path}.style.stroke`);
    }
    requireAbsent(value.style, "shadow", `${path}.style`);
    requireAbsent(value.style, "glow", `${path}.style`);
    requireAbsent(value.style, "filter", `${path}.style`);
    requireAbsent(value.style, "gradient", `${path}.style`);
    return value as MotionShapeLayer;
  }

  if (type === "text") {
    if (typeof value.text !== "string") {
      fail(`${path}.text is missing required field`);
    }
    if (!isRecord(value.style)) {
      fail(`${path}.style is missing required field`);
    }
    if (value.style.fontFamily !== "Inter") {
      fail(`Unsupported motion content at ${path}.style.fontFamily`);
    }
    finiteNumber(value.style.fontSize, `${path}.style.fontSize`);
    requiredString(value.style.color, `${path}.style.color`);
    if (!Array.isArray(value.textAnimators) || value.textAnimators.length < 1) {
      fail(`${path}.textAnimators is missing required field`);
    }
    if (isRecord(value.style.stroke)) {
      rejectVisibleStroke(value.style.stroke, `${path}.style.stroke`);
    }
    requireAbsent(value.style, "shadow", `${path}.style`);
    requireAbsent(value.style, "glow", `${path}.style`);
    requireAbsent(value.style, "filter", `${path}.style`);
    requireAbsent(value.style, "gradient", `${path}.style`);
    for (const [index, animator] of value.textAnimators.entries()) {
      parseAnimator(animator, `${path}.textAnimators[${index}]`, seenIds);
    }
    return value as MotionTextLayer;
  }

  fail(`Unsupported motion content at ${path}.type`);
}

function parseComposition(value: unknown, path: string, seenIds: Set<string>): MotionComposition {
  if (!isRecord(value)) {
    fail(`${path} is not a valid motion composition`);
  }
  const id = requiredString(value.id, `${path}.id`);
  if (seenIds.has(id)) {
    fail(`Duplicate motion id at ${path}.id: ${id}`);
  }
  seenIds.add(id);
  finiteNumber(value.width, `${path}.width`);
  finiteNumber(value.height, `${path}.height`);
  finiteNumber(value.frameRate, `${path}.frameRate`);
  finiteNumber(value.duration, `${path}.duration`);
  requiredString(value.backgroundColor, `${path}.backgroundColor`);
  if (!Array.isArray(value.layers) || value.layers.length === 0) {
    fail(`${path}.layers is missing required field`);
  }
  requireAbsentOrEmptyArray(value, "assets", path);
  requireAbsent(value, "camera", path);
  requireAbsentOrEmptyArray(value, "lights", path);
  requireAbsentOrEmptyArray(value, "audioClips", path);
  for (const [index, layer] of value.layers.entries()) {
    parseLayer(layer, `${path}.layers[${index}]`, seenIds);
  }
  return value as MotionComposition;
}

function parseInstance(value: unknown, path: string, seenIds: Set<string>): MotionInstance {
  if (!isRecord(value)) {
    fail(`${path} is not a valid motion instance`);
  }
  const id = requiredString(value.id, `${path}.id`);
  if (seenIds.has(id)) {
    fail(`Duplicate motion id at ${path}.id: ${id}`);
  }
  seenIds.add(id);
  requiredString(value.compositionId, `${path}.compositionId`);
  finiteNumber(value.startTime, `${path}.startTime`);
  const duration = finiteNumber(value.duration, `${path}.duration`);
  if (duration < 0) {
    fail(`${path}.duration is not finite`);
  }
  finiteNumber(value.opacity, `${path}.opacity`);
  parseTransform(value.transform, `${path}.transform`);
  const fitMode = isRecord(value.transform) ? value.transform.fitMode : undefined;
  if (fitMode !== undefined && fitMode !== "contain") {
    fail(`Unsupported motion content at ${path}.transform.fitMode`);
  }
  requireAbsent(value, "variableOverrides", path);
  requireAbsent(value, "blendMode", path);
  return value as MotionInstance;
}

function clipMetadata(clip: TimelineClip): Record<string, unknown> | undefined {
  const metadata = clip.metadata;
  return isRecord(metadata) ? metadata : undefined;
}

function tracksWithClips(tracks: Track[]): Track[] {
  return tracks.filter((track) => Array.isArray(track.clips) && track.clips.length > 0);
}

export function validateMotionSupport(project: ProductionDocument): SupportedMotionScene {
  if (!Array.isArray(project.mediaLibrary.items) || project.mediaLibrary.items.length > 0) {
    fail("Unsupported motion content at project.mediaLibrary.items");
  }
  for (const field of ["textClips", "shapeClips", "svgClips", "stickerClips"] as const) {
    const clips = project[field];
    if (Array.isArray(clips) && clips.length > 0) {
      fail(`Unsupported motion content at project.${field}`);
    }
  }

  const compositions = project.motionCompositions;
  if (!Array.isArray(compositions) || compositions.length === 0) {
    fail("Unsupported motion content: no supported composition");
  }
  if (compositions.length !== 1) {
    fail("Unsupported motion content at project.motionCompositions");
  }

  const instances = project.motionInstances;
  if (!Array.isArray(instances) || instances.length === 0) {
    fail("Motion instance not found");
  }
  if (instances.length !== 1) {
    fail("Unsupported motion content at project.motionInstances");
  }

  const seenIds = new Set<string>();
  const composition = parseComposition(compositions[0], "project.motionCompositions[0]", seenIds);
  const instance = parseInstance(instances[0], "project.motionInstances[0]", seenIds);
  if (instance.compositionId !== composition.id) {
    fail(`Motion composition not found: ${instance.compositionId}`);
  }

  const populatedTracks = tracksWithClips(project.timeline.tracks);
  if (populatedTracks.length !== 1) {
    fail("Unsupported motion content at project.timeline.tracks");
  }
  const track = populatedTracks[0];
  if (track.clips.length !== 1) {
    fail("Unsupported motion content at project.timeline.tracks[0].clips");
  }
  const clip = track.clips[0];
  const metadata = clipMetadata(clip);
  const motionInstanceId = metadata?.motionInstanceId;
  const motionCompositionId = metadata?.motionCompositionId;
  if (typeof motionInstanceId !== "string" || motionInstanceId !== instance.id) {
    fail("Motion instance not found");
  }
  if (typeof motionCompositionId === "string" && motionCompositionId !== composition.id) {
    fail(`Motion composition not found: ${motionCompositionId}`);
  }
  if (instance.trackId !== undefined && typeof track.id === "string" && instance.trackId !== track.id) {
    fail(`Motion instance not found: track ${instance.trackId}`);
  }

  return { composition, instance };
}
