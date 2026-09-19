export const SCHEMA_VERSION = "1.2.0";

export type ProjectSettings = {
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
  channels: number;
};

export type TimedItem = {
  startTime: number;
  duration: number;
  [key: string]: unknown;
};

export type TimelineClip = TimedItem & {
  id?: string;
  mediaId?: string;
};

export type Track = {
  clips: TimelineClip[];
  [key: string]: unknown;
};

export type Subtitle = {
  endTime?: number;
  [key: string]: unknown;
};

export type Timeline = {
  tracks: Track[];
  subtitles: Subtitle[];
  duration: number;
  markers: unknown[];
  [key: string]: unknown;
};

export type MediaItem = {
  id: string;
  blob?: unknown;
  fileHandle?: unknown;
  waveformData?: unknown;
  [key: string]: unknown;
};

export type MediaLibrary = {
  items: MediaItem[];
  [key: string]: unknown;
};

export type ProductionDocument = {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  settings: ProjectSettings;
  mediaLibrary: MediaLibrary;
  timeline: Timeline;
  motionCompositions: unknown[];
  motionInstances: TimedItem[];
  textClips: TimedItem[];
  shapeClips: TimedItem[];
  svgClips: TimedItem[];
  stickerClips: TimedItem[];
  [key: string]: unknown;
};

export type ProjectFile = {
  version: string;
  minimumReaderVersion?: string;
  capabilities?: unknown;
  project: ProductionDocument;
  [key: string]: unknown;
};

export type AssetIndex = {
  schemaVersion: 1;
  items: Record<string, { relativePath: string }>;
};

export type DocumentSnapshot = {
  version: string;
  id: string;
  name: string;
  path: string;
  revision: number;
  settings: ProjectSettings;
  project: ProductionDocument;
  assets: AssetIndex;
  generation?: number;
};
