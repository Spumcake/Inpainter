import type { ProductionDocument, TimedItem } from "./types.ts";

function timedEnd(item: TimedItem): number {
  const startTime = Number.isFinite(item.startTime) ? item.startTime : 0;
  const duration = Number.isFinite(item.duration) ? item.duration : 0;
  return Math.max(0, startTime) + Math.max(0, duration);
}

function asTimedItems(value: unknown): TimedItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as TimedItem[];
}

/** Returns the last authored frame across stored timeline surfaces. */
export function calculateProjectDuration(project: ProductionDocument): number {
  let maxEnd = 0;
  const include = (items: readonly TimedItem[] | undefined): void => {
    for (const item of items ?? []) maxEnd = Math.max(maxEnd, timedEnd(item));
  };

  for (const track of project.timeline.tracks) include(track.clips);
  include(project.textClips);
  include(project.shapeClips);
  include(project.svgClips);
  include(project.stickerClips);
  include(asTimedItems(project.adjustmentLayers));
  include(asTimedItems(project.nestedInstances));
  include(project.motionInstances);

  for (const subtitle of project.timeline.subtitles ?? []) {
    const raw = subtitle.endTime;
    const endTime = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    maxEnd = Math.max(maxEnd, Math.max(0, endTime));
  }

  return maxEnd;
}
