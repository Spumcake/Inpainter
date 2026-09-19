import { v4 as uuidv4 } from "uuid";

import type { ProductionDocument, Track } from "../types.ts";
import { createInverseAction, type ActionHandler } from "./registry.ts";
import type { Action, ActionHandlerContext, ValidationResult } from "./types.ts";

const TRACK_NAMES: Record<string, string> = {
  video: "Video",
  audio: "Audio",
  image: "Image",
  text: "Text",
  graphics: "Graphics",
};

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function invalid(message: string, path?: string): ValidationResult {
  return { valid: false, errors: [{ code: "INVALID_PARAMS", message, path }] };
}

function trackIdOf(track: Track): string {
  return typeof track.id === "string" ? track.id : "";
}

function findTrackIndex(project: ProductionDocument, trackId: string): number {
  return project.timeline.tracks.findIndex((track) => trackIdOf(track) === trackId);
}

export const trackAddHandler: ActionHandler = {
  type: "track/add",
  validate(action: Action, project: ProductionDocument): ValidationResult {
    const trackType = action.params.trackType;
    if (typeof trackType !== "string" || !trackType.trim()) {
      return invalid("Track type is required and must be a string", "params.trackType");
    }
    const trackId = action.params.trackId;
    if (typeof trackId === "string" && trackId && findTrackIndex(project, trackId) >= 0) {
      return invalid(`Track already exists: ${trackId}`, "params.trackId");
    }
    return ok();
  },
  apply(action: Action, project: ProductionDocument, ctx: ActionHandlerContext): void {
    const trackType = String(action.params.trackType);
    const trackId = typeof action.params.trackId === "string" && action.params.trackId
      ? action.params.trackId
      : `track-${uuidv4()}`;
    action.params.trackId = trackId;
    const count = project.timeline.tracks.filter((track) => track.type === trackType).length + 1;
    const name =
      typeof action.params.name === "string" && action.params.name
        ? action.params.name
        : `${TRACK_NAMES[trackType] ?? trackType} ${count}`;
    const position =
      typeof action.params.position === "number" && Number.isInteger(action.params.position)
        ? Math.max(0, Math.min(project.timeline.tracks.length, action.params.position))
        : project.timeline.tracks.length;
    const newTrack: Track = {
      id: trackId,
      type: trackType,
      name,
      clips: [],
      transitions: [],
      locked: false,
      hidden: false,
      muted: false,
      solo: false,
    };
    project.timeline.tracks = [
      ...project.timeline.tracks.slice(0, position),
      newTrack,
      ...project.timeline.tracks.slice(position),
    ];
    ctx.lastAddedIds.set("track", trackId);
  },
  invert(action: Action): Action {
    return createInverseAction(action, "track/remove", { trackId: action.params.trackId });
  },
};

export const trackRemoveHandler: ActionHandler = {
  type: "track/remove",
  validate(action: Action, project: ProductionDocument): ValidationResult {
    const trackId = action.params.trackId;
    if (typeof trackId !== "string" || !trackId) {
      return invalid("Track id is required", "params.trackId");
    }
    if (findTrackIndex(project, trackId) < 0) {
      return invalid(`Track not found: ${trackId}`, "params.trackId");
    }
    return ok();
  },
  apply(action: Action, project: ProductionDocument): void {
    const trackId = String(action.params.trackId);
    project.timeline.tracks = project.timeline.tracks.filter((track) => trackIdOf(track) !== trackId);
  },
  invert(action: Action, projectBefore: ProductionDocument): Action | null {
    const trackId = String(action.params.trackId);
    const position = findTrackIndex(projectBefore, trackId);
    if (position < 0) {
      return null;
    }
    return createInverseAction(action, "track/restore", {
      track: projectBefore.timeline.tracks[position],
      position,
    });
  },
};

export const trackRestoreHandler: ActionHandler = {
  type: "track/restore",
  validate(action: Action, project: ProductionDocument): ValidationResult {
    const track = action.params.track;
    if (track === null || typeof track !== "object" || Array.isArray(track)) {
      return invalid("Track is required", "params.track");
    }
    const id = (track as Track).id;
    if (typeof id !== "string" || !id) {
      return invalid("Track id is required", "params.track.id");
    }
    if (findTrackIndex(project, id) >= 0) {
      return invalid(`Track already exists: ${id}`, "params.track.id");
    }
    return ok();
  },
  apply(action: Action, project: ProductionDocument): void {
    const track = action.params.track as Track;
    const position =
      typeof action.params.position === "number" && Number.isInteger(action.params.position)
        ? Math.max(0, Math.min(project.timeline.tracks.length, action.params.position))
        : project.timeline.tracks.length;
    project.timeline.tracks = [
      ...project.timeline.tracks.slice(0, position),
      track,
      ...project.timeline.tracks.slice(position),
    ];
  },
  invert(action: Action): Action {
    const track = action.params.track as Track;
    return createInverseAction(action, "track/remove", { trackId: track.id });
  },
};
