import type { ProductionDocument } from "../types.ts";
import { SUPPORTED_KEYFRAME_PROPERTIES } from "../motion/types.ts";
import { createInverseAction, type ActionHandler } from "./registry.ts";
import type { Action, ValidationResult } from "./types.ts";

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function invalid(message: string, path?: string): ValidationResult {
  return { valid: false, errors: [{ code: "INVALID_PARAMS", message, path }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function findComposition(
  project: ProductionDocument,
  compositionId: string,
): Record<string, unknown> | undefined {
  return project.motionCompositions.find(
    (candidate) => isRecord(candidate) && candidate.id === compositionId,
  ) as Record<string, unknown> | undefined;
}

function findLayer(
  composition: Record<string, unknown>,
  layerId: string,
): Record<string, unknown> | undefined {
  if (!Array.isArray(composition.layers)) {
    return undefined;
  }
  return composition.layers.find((layer) => isRecord(layer) && layer.id === layerId) as
    | Record<string, unknown>
    | undefined;
}

function findKeyframe(
  layer: Record<string, unknown>,
  keyframeId: string,
): Record<string, unknown> | undefined {
  if (!Array.isArray(layer.keyframes)) {
    return undefined;
  }
  return layer.keyframes.find((keyframe) => isRecord(keyframe) && keyframe.id === keyframeId) as
    | Record<string, unknown>
    | undefined;
}

function isSupportedKeyframeProperty(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (SUPPORTED_KEYFRAME_PROPERTIES as readonly string[]).includes(value)
  );
}

function markCompositionModified(composition: Record<string, unknown>): void {
  composition.modifiedAt = Date.now();
}

export const updateLayerTextHandler: ActionHandler = {
  type: "motion/updateLayerText",
  validate(action: Action, project: ProductionDocument): ValidationResult {
    const compositionId = action.params.compositionId;
    const layerId = action.params.layerId;
    const text = action.params.text;
    if (typeof compositionId !== "string" || typeof layerId !== "string") {
      return invalid("motion/updateLayerText requires compositionId and layerId");
    }
    if (typeof text !== "string") {
      return invalid("motion/updateLayerText requires a text string", "params.text");
    }
    const composition = findComposition(project, compositionId);
    if (!composition) {
      return invalid(`Motion composition not found: ${compositionId}`, "params.compositionId");
    }
    const layer = findLayer(composition, layerId);
    if (!layer || layer.type !== "text") {
      return invalid(`Text layer not found: ${layerId}`, "params.layerId");
    }
    return ok();
  },
  apply(action: Action, project: ProductionDocument): void {
    const compositionId = String(action.params.compositionId);
    const layerId = String(action.params.layerId);
    const text = String(action.params.text);
    const composition = findComposition(project, compositionId);
    if (!composition || !Array.isArray(composition.layers)) {
      return;
    }
    composition.layers = composition.layers.map((layer) => {
      if (!isRecord(layer) || layer.id !== layerId || layer.type !== "text") {
        return layer;
      }
      return { ...layer, text };
    });
    markCompositionModified(composition);
  },
  invert(action: Action, projectBefore: ProductionDocument): Action | null {
    const compositionId = String(action.params.compositionId);
    const layerId = String(action.params.layerId);
    const composition = findComposition(projectBefore, compositionId);
    const layer = composition ? findLayer(composition, layerId) : undefined;
    if (!layer || layer.type !== "text" || typeof layer.text !== "string") {
      return null;
    }
    return createInverseAction(action, "motion/updateLayerText", {
      compositionId,
      layerId,
      text: layer.text,
    });
  },
};

export const updateLayerKeyframeTimeHandler: ActionHandler = {
  type: "motion/updateLayerKeyframeTime",
  validate(action: Action, project: ProductionDocument): ValidationResult {
    const compositionId = action.params.compositionId;
    const layerId = action.params.layerId;
    const keyframeId = action.params.keyframeId;
    const toTime = action.params.toTime;
    if (
      typeof compositionId !== "string" ||
      typeof layerId !== "string" ||
      typeof keyframeId !== "string"
    ) {
      return invalid(
        "motion/updateLayerKeyframeTime requires compositionId, layerId, and keyframeId",
      );
    }
    if (typeof toTime !== "number" || !Number.isFinite(toTime)) {
      return invalid("motion/updateLayerKeyframeTime requires a finite toTime", "params.toTime");
    }
    const composition = findComposition(project, compositionId);
    if (!composition) {
      return invalid(`Motion composition not found: ${compositionId}`, "params.compositionId");
    }
    const duration = composition.duration;
    if (typeof duration !== "number" || !Number.isFinite(duration)) {
      return invalid(`Motion composition not found: ${compositionId}`, "params.compositionId");
    }
    if (toTime < 0 || toTime > duration) {
      return invalid(
        `Keyframe time ${toTime} is outside composition duration ${duration}`,
        "params.toTime",
      );
    }
    const layer = findLayer(composition, layerId);
    if (!layer) {
      return invalid(`Layer not found: ${layerId}`, "params.layerId");
    }
    const keyframe = findKeyframe(layer, keyframeId);
    if (!keyframe) {
      return invalid(`Keyframe not found: ${keyframeId}`, "params.keyframeId");
    }
    if (!isSupportedKeyframeProperty(keyframe.property)) {
      return invalid(
        `Unsupported keyframe property: ${String(keyframe.property)}`,
        "params.keyframeId",
      );
    }
    return ok();
  },
  apply(action: Action, project: ProductionDocument): void {
    const compositionId = String(action.params.compositionId);
    const layerId = String(action.params.layerId);
    const keyframeId = String(action.params.keyframeId);
    const toTime = Number(action.params.toTime);
    const composition = findComposition(project, compositionId);
    if (!composition || !Array.isArray(composition.layers)) {
      return;
    }
    // Preserve stored keyframe array order. Coincident times are allowed; evaluation
    // sorts per-property by time when interpolating.
    composition.layers = composition.layers.map((layer) => {
      if (!isRecord(layer) || layer.id !== layerId || !Array.isArray(layer.keyframes)) {
        return layer;
      }
      return {
        ...layer,
        keyframes: layer.keyframes.map((keyframe) =>
          isRecord(keyframe) && keyframe.id === keyframeId ? { ...keyframe, time: toTime } : keyframe,
        ),
      };
    });
    markCompositionModified(composition);
  },
  invert(action: Action, projectBefore: ProductionDocument): Action | null {
    const compositionId = String(action.params.compositionId);
    const layerId = String(action.params.layerId);
    const keyframeId = String(action.params.keyframeId);
    const composition = findComposition(projectBefore, compositionId);
    const layer = composition ? findLayer(composition, layerId) : undefined;
    const prior = layer ? findKeyframe(layer, keyframeId) : undefined;
    if (!prior || typeof prior.time !== "number") {
      return null;
    }
    return createInverseAction(action, "motion/updateLayerKeyframeTime", {
      compositionId,
      layerId,
      keyframeId,
      toTime: prior.time,
    });
  },
};
