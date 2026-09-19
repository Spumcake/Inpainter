import { v4 as uuidv4 } from "uuid";

import type { ProductionDocument, ProjectSettings, Timeline } from "./types.ts";

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  width: 1920,
  height: 1080,
  frameRate: 30,
  sampleRate: 48000,
  channels: 2,
};

export function createDefaultTimeline(): Timeline {
  return {
    tracks: [],
    subtitles: [],
    duration: 0,
    markers: [],
  };
}

export function createEmptyProject(
  name: string,
  settings?: Partial<ProjectSettings>,
): ProductionDocument {
  const now = Date.now();
  return {
    id: uuidv4(),
    name,
    createdAt: now,
    modifiedAt: now,
    settings: { ...DEFAULT_PROJECT_SETTINGS, ...settings },
    mediaLibrary: { items: [] },
    timeline: createDefaultTimeline(),
    motionCompositions: [],
    motionInstances: [],
    textClips: [],
    shapeClips: [],
    svgClips: [],
    stickerClips: [],
  };
}
