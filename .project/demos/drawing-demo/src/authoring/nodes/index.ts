export {
  buildCanvasText,
  buildFrame,
  buildGraphText,
  buildImage,
  buildOutput,
  buildSketch,
  buildContainer,
  buildSketchGroup,
  DEFAULT_FRAME_CROP,
  DEFAULT_GRAPH_TEXT_RECT,
  EMPTY_SKETCH_BOUNDS,
  hasSelectableSketchBounds,
  paletteSetWithId,
  type BuildCanvasTextArgs,
  type BuildFrameArgs,
  type BuildGraphTextArgs,
  type BuildImageArgs,
  type BuildOutputArgs,
  type BuildSketchArgs,
  type BuildContainerArgs,
  type BuildSketchGroupArgs,
} from './factories';
export {
  cloneNodeWithOffset,
  createCanvasText,
  createFrame,
  createGraphText,
  createImage,
  createNode,
  createSketch,
  DEFAULT_DUPLICATE_OFFSET,
  deleteNodes,
  duplicateNodes,
  ensureOutputForOwner,
  insertNodes,
  moveCanvasText,
  moveFrameCrop,
  moveFrameGraph,
  transformFrameGraph,
  moveGraphText,
  moveSketch,
  resizeCanvasText,
  resizeFrameCrop,
  resizeGraphText,
  resizeSketch,
  reorderSketchStack,
  reorderSurfaceStack,
  moveSketchInStack,
  moveImageInStack,
  moveFrameInStack,
  moveNodeInSurfaceStack,
  renameFrame,
  renameImage,
  renameSketch,
  setFrameCrop,
  setFramePrompt,
  setFrameWindowUrl,
  setImagePrompt,
  setOutputRelativeScale,
  setSketchPrompt,
  setContainerPrompt,
  setSketchGroupPrompt,
  setNodeLocked,
  setNodeVisible,
  transformImageRect,
  transformSketchContents,
  transformContainerContents,
  transformSketchGroupContents,
  translateSelectedNodes,
  groupSelection,
  groupSketches,
  makeContainerFromSketch,
  ungroupContainer,
  ungroupSketchGroup,
  renameContainer,
  renameSketchGroup,
} from './commands';
export {
  findOutputForOwner,
  hostRectForOwner,
  isOutputOwnerNode,
  outputCoverBaseSize,
  outputDisplayRect,
  outputRectFromHost,
  parseAspectRatio,
  relativeScaleFromDisplayRect,
  type AspectRatio,
} from './outputGeometry';
export {
  buildOutputForOwner,
  needsOutputForOwner,
} from './allocateOutput';
export {
  clampRectSize,
  effectiveStrokeWidth,
  mapPointThroughRects,
  scaleSketchPathsThroughRects,
  sketchInkScale,
  strokeBelongsToSketch,
  strokeWidthScale,
} from './transformGeometry';
export { listSketchesForCanvas } from './listSketches';
export {
  nextUntitledSketchName,
  UNTITLED_SKETCH_LABEL,
} from './untitledSketchName';
export {
  nextUntitledSketchGroupName,
  UNTITLED_GROUP_LABEL,
} from './untitledSketchGroupName';
export {
  nextUntitledFrameName,
  UNTITLED_FRAME_LABEL,
} from './untitledFrameName';
export {
  nextUntitledImageNameForCanvas,
  nextUntitledImageNameForGraph,
  UNTITLED_IMAGE_LABEL,
} from './untitledImageName';
export {
  nextRenderResultImageName,
  RENDER_RESULT_LABEL,
} from './renderResultImageName';
export { repairSketchPaletteBinds } from './repairSketchPaletteBinds';
export {
  addPaletteToSketch,
  appendSketchSlot,
  buildDefaultPaletteSet,
  buildPaletteSetFromSlots,
  clearSketchSlot,
  fillSketchSlot,
  getSketchBrushes,
  getSketchPalette,
  getSketchPalettes,
  patchSketchBrush,
  removePaletteFromSketch,
  renameSketchPalette,
  reorderSketchSlots,
  repairSketchPaletteSets,
  resetSketchPaletteToDefault,
  setSketchActivePaletteId,
  type SketchPaletteSet,
} from './sketchPalette';
export {
  canReorderSketchStack,
  computeSketchStackOrders,
  computeSketchStackOrdersToIndex,
  sketchStackActionLabel,
  type SketchStackAction,
  type SketchStackOrders,
} from './sketchStack';
export {
  comparePeerStackOrder,
  computePeerStackOrdersToIndex,
  nextPeerStackOrder,
  type PeerStackItem,
  type PeerStackOrders,
} from './peerStack';
export {
  applySurfaceStackOrders,
  canReorderSurfaceStack,
  computeSurfaceStackOrders,
  computeSurfaceStackOrdersToIndex,
  listCanvasSurfaceStack,
  listGraphSurfaceStack,
  nextSurfaceStackOrder,
  resolveSurfaceStackForNode,
  surfaceStackActionLabel,
  type CanvasSurfaceStackNode,
  type GraphSurfaceStackNode,
  type SurfaceStackNode,
} from './surfaceStack';
export {
  addToSelection,
  clearSelection,
  cloneSelectionSet,
  isSelected,
  removeFromSelection,
  selectionForNodeContextMenu,
  toggleSelection,
} from './selection';
export {
  copyNodes,
  isClipboardPayload,
  nodePasteOrigin,
  pasteNodesCommand,
  pasteOffsetForNodes,
  rebindNodeToCanvas,
  type ClipboardPayload,
  type PasteNodesOptions,
} from './clipboard';
export { activateSketch } from './activateSketch';
export {
  OUTPUT_ACCENT,
  OUTPUT_ORANGE_ACCENT,
  OUTPUT_ORANGE_TEXT_CLASS,
  OUTPUT_ORANGE_TRIGGER_ACTIVE_CLASS,
  FRAME_OUTPUT_CHROME,
  type NodeChrome,
} from './nodeChrome';
export {
  NODE_CAPABILITIES,
  capabilitiesFor,
  chromeForNode,
  chromeForNodeType,
  contextActionsForNodeType,
  type AuthoringSurface,
  type ContextActionId,
  type NodeCapabilities,
} from './nodeCapabilities';
export {
  intersectContextActions,
  resolveContextMenuModel,
  surfaceContextActions,
  type ContextMenuModel,
  type ContextMenuRow,
  type ResolveContextMenuModelArgs,
  type StructuralContextActionId,
  type StructuralContextMenuRow,
} from './contextActions';
export {
  canGroupSelection,
  canMakeContainer,
  canUngroupContainer,
  canvasSelectEntries,
  containerIdForSketch,
  expandClipboardNodeIds,
  expandDeleteIds,
  groupIdForSketch,
  isContainer,
  isSketchContained,
  isSketchGrouped,
  isSketchGroup,
  listContainersForCanvas,
  mapMemberRectThroughGroupResize,
  memberSketchesForContainer,
  memberSketchesForGroup,
  parseGroupSelection,
  recomputeContainerBounds,
  recomputeGroupBounds,
  showGroupRow,
  sketchHasInkPaths,
  syncParentContainerBounds,
  syncParentGroupBounds,
  unionBoundsForRects,
  type CanvasSelectEntry,
  type GroupSelectionParts,
} from './container';
export { iconForNodeType } from './nodeIcons';
export {
  selectTargetLabel,
  selectTargetsForFocusedSurface,
  type SelectTargetPeerGroup,
  type SelectTargetRow,
} from './selectTargets';
export {
  marqueeCandidatesForFocusedSurface,
  nodesOverlappingMarquee,
  normalizeMarqueeRect,
  rectsOverlap,
  selectionAfterResizeHandleDown,
  type MarqueeCandidate,
} from './marqueeCandidates';
export {
  commitCreatedSketch,
  commitPaintCreatedSketch,
} from './commitSketchCreate';
export {
  commitCreatedFrame,
  centeredCropOnArtboard,
  type CommitCreatedFrameArgs,
} from './commitFrameCreate';
export {
  commitCreatedImage,
  type CommitCreatedImageArgs,
} from './commitImageCreate';
export { editFrameOnCanvas } from './editFrameOnCanvas';
export { clearFrameWindowUrlsForCanvas } from './clearFrameWindowUrlsForCanvas';
export { frameResultImageRect } from './frameResultGeometry';
export {
  frameResultView,
  frameOwningResultImage,
  resolveOutputInputToggleTarget,
  setFrameResultView,
  toggleFrameResultView,
  type FrameResultView,
  type OutputInputToggleTarget,
} from './frameResultView';
export {
  frameResultImageIds,
  landFrameResultImage,
  setFrameResultImageId,
  type LandFrameResultImageArgs,
} from './landFrameResultImage';
export { resolvePaintSketchTarget } from './paintSketchTarget';
export {
  canAcceptImageFileDrop,
  cappedImageSize,
  firstImagePath,
  IMAGE_DROP_MAX_SIDE,
  isImageDropPath,
  readImageNaturalSizeFromSrc,
} from './importImageDrop';
export { useImageFileDrop } from './useImageFileDrop';
export {
  compatibleToolsForNodeType,
  isCanvasFrameOutputViewActive,
  isToolGatedByNodeCompatibility,
  selectionAllowsTool,
} from './compatibleTools';
export {
  hasNodeFocus,
  isNodeFocusType,
  agentFocusOwnerIds,
  agentSoloContentIds,
} from './nodeFocus';
export { isPromptableNodeType } from './isPromptable';
export {
  isPromptEditorEligible,
  solePromptEditorEligibleRef,
} from './promptEligibility';
