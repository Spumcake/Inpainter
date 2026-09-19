import { CoreError } from "../errors.ts";
import { calculateProjectDuration } from "./duration.ts";
import type {
  AssetIndex,
  MediaItem,
  ProductionDocument,
  ProjectFile,
  ProjectSettings,
  Timeline,
  TimelineClip,
  Track,
} from "./types.ts";
import { SCHEMA_VERSION } from "./types.ts";

export { SCHEMA_VERSION };

const VIRTUAL_MEDIA_PREFIXES = ["text-", "shape-", "svg-", "sticker-", "motion-"];

export function emptyAssetIndex(): AssetIndex {
  return { schemaVersion: 1, items: {} };
}

export function projectToJson(project: ProductionDocument): string {
  const projectFile: ProjectFile = {
    version: SCHEMA_VERSION,
    project: stripMediaBlobs(project),
  };
  if (typeof project.minimumReaderVersion === "string") {
    projectFile.minimumReaderVersion = project.minimumReaderVersion;
  }
  if (project.capabilities !== undefined) {
    projectFile.capabilities = project.capabilities;
  }
  return `${JSON.stringify(projectFile, null, 2)}\n`;
}

export function projectFromJson(json: string): ProductionDocument {
  const projectFile = parseProjectFile(json);
  assertReaderCompatibility(projectFile);
  const project = asDocument(projectFile.project, "project");
  if (typeof projectFile.minimumReaderVersion === "string" && projectFile.minimumReaderVersion) {
    project.minimumReaderVersion = projectFile.minimumReaderVersion;
  }
  if (projectFile.capabilities !== undefined) {
    project.capabilities = projectFile.capabilities;
  }
  return withRecalculatedDuration(project);
}

export function parseSavePayload(value: unknown): {
  project: ProductionDocument;
  assets?: AssetIndex;
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError("Document save payload must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.project !== undefined) {
    const project = asDocument(record.project, "project");
    return {
      project: withRecalculatedDuration(project),
      assets: record.assets !== undefined ? parseAssetIndexValue(record.assets, "assets") : undefined,
    };
  }
  const project = asDocument(record, "project");
  return { project: withRecalculatedDuration(project) };
}

export function assetIndexToJson(index: AssetIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

export function parseAssetIndexJson(json: string, path: string): AssetIndex {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse error";
    throw new CoreError(`${path} is not valid JSON: ${message}`);
  }
  return parseAssetIndexValue(parsed, path);
}

export function documentReferencesMedia(project: ProductionDocument): boolean {
  if (project.mediaLibrary.items.length > 0) {
    return true;
  }
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      if (typeof clip.mediaId === "string" && clip.mediaId && !isVirtualMediaId(clip.mediaId)) {
        return true;
      }
    }
  }
  return false;
}

function parseProjectFile(json: string): ProjectFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse error";
    throw new CoreError(`Invalid project JSON: ${message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CoreError("Invalid project JSON: envelope must be an object");
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.version !== "string" || !record.version) {
    throw new CoreError("Invalid project JSON: missing version field");
  }
  if (record.project === undefined) {
    throw new CoreError("Invalid project JSON: missing project field");
  }
  return record as ProjectFile;
}

function assertReaderCompatibility(projectFile: ProjectFile): void {
  const minimumReaderVersion = projectFile.minimumReaderVersion;
  if (minimumReaderVersion && compareVersions(minimumReaderVersion, SCHEMA_VERSION) > 0) {
    throw new CoreError(
      `This project requires document reader ${minimumReaderVersion} or newer. Current reader: ${SCHEMA_VERSION}.`,
    );
  }
}

function asDocument(value: unknown, path: string): ProductionDocument {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError(`Invalid project JSON: ${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const id = requiredString(record, "id", path);
  const name = requiredString(record, "name", path);
  const createdAt = requiredNumber(record, "createdAt", path);
  const modifiedAt = requiredNumber(record, "modifiedAt", path);
  const settings = asSettings(record.settings, `${path}.settings`);
  const mediaLibrary = asMediaLibrary(record.mediaLibrary, `${path}.mediaLibrary`);
  const timeline = asTimeline(record.timeline, `${path}.timeline`);
  validateClipMedia(timeline, mediaLibrary.items, path);
  return {
    ...record,
    id,
    name,
    createdAt,
    modifiedAt,
    settings,
    mediaLibrary,
    timeline,
    motionCompositions: asUnknownArray(record.motionCompositions, `${path}.motionCompositions`),
    motionInstances: asTimedArray(record.motionInstances, `${path}.motionInstances`),
    textClips: asTimedArray(record.textClips, `${path}.textClips`),
    shapeClips: asTimedArray(record.shapeClips, `${path}.shapeClips`),
    svgClips: asTimedArray(record.svgClips, `${path}.svgClips`),
    stickerClips: asTimedArray(record.stickerClips, `${path}.stickerClips`),
  };
}

function asSettings(value: unknown, path: string): ProjectSettings {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError(`Invalid project JSON: missing ${path}`);
  }
  const record = value as Record<string, unknown>;
  return {
    ...record,
    width: requiredNumber(record, "width", path),
    height: requiredNumber(record, "height", path),
    frameRate: requiredNumber(record, "frameRate", path),
    sampleRate: requiredNumber(record, "sampleRate", path),
    channels: requiredNumber(record, "channels", path),
  };
}

function asMediaLibrary(value: unknown, path: string): ProductionDocument["mediaLibrary"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError(`Invalid project JSON: missing ${path}`);
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.items)) {
    throw new CoreError(`Invalid project JSON: ${path}.items must be an array`);
  }
  const items = record.items.map((item, index) => asMediaItem(item, `${path}.items[${index}]`));
  return { ...record, items };
}

function asMediaItem(value: unknown, path: string): MediaItem {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError(`Invalid project JSON: ${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  return { ...record, id: requiredString(record, "id", path) };
}

function asTimeline(value: unknown, path: string): Timeline {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError(`Invalid project JSON: missing ${path}`);
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.tracks)) {
    throw new CoreError(`Invalid project JSON: ${path}.tracks must be an array`);
  }
  const tracks = record.tracks.map((track, index) => asTrack(track, `${path}.tracks[${index}]`));
  const subtitles = Array.isArray(record.subtitles) ? (record.subtitles as Timeline["subtitles"]) : [];
  const markers = Array.isArray(record.markers) ? record.markers : [];
  const duration =
    typeof record.duration === "number" && Number.isFinite(record.duration) ? record.duration : 0;
  return { ...record, tracks, subtitles, markers, duration };
}

function asTrack(value: unknown, path: string): Track {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError(`Invalid project JSON: ${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.clips)) {
    throw new CoreError(`Invalid project JSON: ${path}.clips must be an array`);
  }
  const clips = record.clips.map((clip, index) => asClip(clip, `${path}.clips[${index}]`));
  return { ...record, clips };
}

function asClip(value: unknown, path: string): TimelineClip {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError(`Invalid project JSON: ${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const startTime =
    typeof record.startTime === "number" && Number.isFinite(record.startTime) ? record.startTime : 0;
  const duration =
    typeof record.duration === "number" && Number.isFinite(record.duration) ? record.duration : 0;
  return { ...record, startTime, duration };
}

function asUnknownArray(value: unknown, path: string): unknown[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new CoreError(`Invalid project JSON: ${path} must be an array`);
  }
  return value;
}

function asTimedArray(value: unknown, path: string): ProductionDocument["motionInstances"] {
  return asUnknownArray(value, path).map((item, index) => asClip(item, `${path}[${index}]`));
}

function validateClipMedia(
  timeline: Timeline,
  items: MediaItem[],
  path: string,
): void {
  const mediaIds = new Set(items.map((item) => item.id));
  for (const [trackIndex, track] of timeline.tracks.entries()) {
    for (const [clipIndex, clip] of track.clips.entries()) {
      const mediaId = clip.mediaId;
      if (!mediaId || isVirtualMediaId(mediaId) || mediaIds.has(mediaId)) {
        continue;
      }
      throw new CoreError(
        `Invalid project JSON: ${path}.timeline.tracks[${trackIndex}].clips[${clipIndex}] references missing mediaId ${mediaId}`,
      );
    }
  }
}

function isVirtualMediaId(mediaId: string): boolean {
  return VIRTUAL_MEDIA_PREFIXES.some((prefix) => mediaId.startsWith(prefix));
}

function stripMediaBlobs(project: ProductionDocument): ProductionDocument {
  return {
    ...project,
    mediaLibrary: {
      ...project.mediaLibrary,
      items: project.mediaLibrary.items.map((item) => ({
        ...item,
        blob: null,
        fileHandle: null,
        waveformData: null,
      })),
    },
  };
}

function withRecalculatedDuration(project: ProductionDocument): ProductionDocument {
  return {
    ...project,
    timeline: {
      ...project.timeline,
      duration: calculateProjectDuration(project),
    },
  };
}

function parseAssetIndexValue(value: unknown, path: string): AssetIndex {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError(`${path} is not a valid asset index`);
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new CoreError(`${path} is not a valid asset index`);
  }
  if (record.items === null || typeof record.items !== "object" || Array.isArray(record.items)) {
    throw new CoreError(`${path} is not a valid asset index`);
  }
  const items: AssetIndex["items"] = {};
  for (const [mediaId, entry] of Object.entries(record.items as Record<string, unknown>)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new CoreError(`${path}.items.${mediaId} is not a valid asset record`);
    }
    const relativePath = (entry as Record<string, unknown>).relativePath;
    if (typeof relativePath !== "string" || !relativePath) {
      throw new CoreError(`${path}.items.${mediaId} is missing relativePath`);
    }
    items[mediaId] = { relativePath };
  }
  return { schemaVersion: 1, items };
}

function requiredString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value) {
    throw new CoreError(`Invalid project JSON: missing ${path}.${key}`);
  }
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string, path: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CoreError(`Invalid project JSON: missing ${path}.${key}`);
  }
  return value;
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] =>
    value
      .split(".")
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0);
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
