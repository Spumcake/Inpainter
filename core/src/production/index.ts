export { createEmptyProject, createDefaultTimeline, DEFAULT_PROJECT_SETTINGS } from "./empty.ts";
export { cloneProject, freezeProject } from "./freeze.ts";
export { calculateProjectDuration } from "./duration.ts";
export {
  PROJECT_FILENAME,
  assetIndexFile,
  assetIndexStageFile,
  commitFile,
  documentStageFile,
  legacyAssetIndexFile,
  lockFile,
  projectDirectory,
  resolveProjectFile,
} from "./paths.ts";
export { COMMIT_SCHEMA_VERSION, commitToJson, parseCommitJson } from "./commit.ts";
export type { DocumentCommit } from "./commit.ts";
export {
  SCHEMA_VERSION,
  assetIndexToJson,
  documentReferencesMedia,
  emptyAssetIndex,
  parseAssetIndexJson,
  parseSavePayload,
  projectFromJson,
  projectToJson,
} from "./serializer.ts";
export type {
  AssetIndex,
  DocumentSnapshot,
  ProductionDocument,
  ProjectFile,
  ProjectSettings,
} from "./types.ts";
export {
  ActionExecutor,
  ActionHistory,
  registerFoundationActions,
} from "./actions/index.ts";
export type { Action, ActionResult, HistoryEntry } from "./actions/index.ts";
export {
  SUPPORTED_EASINGS,
  SUPPORTED_KEYFRAME_PROPERTIES,
  applyNamedEasing,
  evaluateKeyframeValue,
  findMotionComposition,
  findMotionInstance,
  findMotionKeyframe,
  findMotionLayer,
  getMotionTextAnimatorRuns,
  getMotionTransformAtTime,
  hasEnabledMotionTextAnimators,
  isIntervalActive,
  resolveCompositionAtTime,
  resolveCompositionDirect,
  resolveInstanceAtTime,
  validateMotionSupport,
} from "./motion/index.ts";
export type {
  MotionComposition,
  MotionInstance,
  MotionKeyframe,
  MotionLayer,
  MotionTextGlyphRun,
  ResolvedCompositionAtTime,
  ResolvedInstanceAtTime,
  ResolvedLayerAtTime,
  SupportedMotionScene,
} from "./motion/index.ts";
