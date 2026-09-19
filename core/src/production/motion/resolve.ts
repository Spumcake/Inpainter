import { CoreError } from "../../errors.ts";
import type { ProductionDocument, Track } from "../types.ts";
import { validateMotionSupport } from "./support.ts";
import type {
  MotionComposition,
  MotionInstance,
  MotionKeyframe,
  MotionLayer,
  ResolvedCompositionAtTime,
  ResolvedInstanceAtTime,
  ResolvedLayerAtTime,
  SupportedMotionScene,
} from "./types.ts";

export function isIntervalActive(time: number, startTime: number, duration: number): boolean {
  return time >= startTime && time < startTime + duration;
}

function requireFiniteTime(time: number, label: string): number {
  if (typeof time !== "number" || !Number.isFinite(time)) {
    throw new CoreError(`${label} is not finite`);
  }
  return time;
}

function freezeView<T extends object>(value: T): T {
  return Object.freeze(value);
}

function resolveLayers(composition: MotionComposition, compositionLocalTime: number): ResolvedLayerAtTime[] {
  return composition.layers.map((layer) => {
    const visible = layer.visible !== false;
    const inRange = isIntervalActive(compositionLocalTime, layer.startTime, layer.duration);
    return freezeView({
      id: layer.id,
      localTime: compositionLocalTime - layer.startTime,
      active: visible && inRange,
    });
  });
}

export function resolveCompositionAtTime(
  scene: SupportedMotionScene,
  compositionLocalTime: number,
): ResolvedCompositionAtTime {
  requireFiniteTime(compositionLocalTime, "compositionLocalTime");
  return freezeView({
    composition: scene.composition,
    compositionLocalTime,
    layers: resolveLayers(scene.composition, compositionLocalTime),
  });
}

function instanceTrack(project: ProductionDocument, instance: MotionInstance): Track | undefined {
  if (typeof instance.trackId !== "string" || !instance.trackId) {
    return project.timeline.tracks.find((track) => Array.isArray(track.clips) && track.clips.length > 0);
  }
  return project.timeline.tracks.find((track) => track.id === instance.trackId);
}

export function resolveInstanceAtTime(
  project: ProductionDocument,
  projectTime: number,
): ResolvedInstanceAtTime {
  requireFiniteTime(projectTime, "projectTime");
  const scene = validateMotionSupport(project);
  const localTime = Math.max(0, projectTime - scene.instance.startTime);
  const track = instanceTrack(project, scene.instance);
  const trackHidden = track?.hidden === true;
  const instanceActive =
    !trackHidden && isIntervalActive(projectTime, scene.instance.startTime, scene.instance.duration);
  const composition = resolveCompositionAtTime(scene, localTime);
  return freezeView({
    ...composition,
    instance: scene.instance,
    projectTime,
    instanceActive,
    trackHidden,
  });
}

export function resolveCompositionDirect(
  project: ProductionDocument,
  compositionLocalTime: number,
): ResolvedCompositionAtTime {
  const scene = validateMotionSupport(project);
  return resolveCompositionAtTime(scene, compositionLocalTime);
}

export function findMotionLayer(composition: MotionComposition, layerId: string): MotionLayer {
  const layer = composition.layers.find((candidate) => candidate.id === layerId);
  if (!layer) {
    throw new CoreError(`Motion layer not found: ${layerId}`);
  }
  return layer;
}

export function findMotionInstance(scene: SupportedMotionScene, instanceId: string): MotionInstance {
  if (scene.instance.id !== instanceId) {
    throw new CoreError(`Motion instance not found: ${instanceId}`);
  }
  return scene.instance;
}

export function findMotionKeyframe(composition: MotionComposition, keyframeId: string): MotionKeyframe {
  for (const layer of composition.layers) {
    const keyframe = layer.keyframes.find((candidate) => candidate.id === keyframeId);
    if (keyframe) return keyframe;
  }
  throw new CoreError(`Motion keyframe not found: ${keyframeId}`);
}

export function findMotionComposition(scene: SupportedMotionScene, compositionId: string): MotionComposition {
  if (scene.composition.id !== compositionId) {
    throw new CoreError(`Motion composition not found: ${compositionId}`);
  }
  return scene.composition;
}
