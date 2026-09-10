import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from 'react';
import {
  framesForCanvas,
  imagesForCanvas,
  sketchesForCanvas,
} from '../authoring/document';
import {
  agentFocusOwnerIds,
  agentSoloContentIds,
  canvasSelectEntries,
  comparePeerStackOrder,
  effectiveStrokeWidth,
  findOutputForOwner,
  frameResultView,
  hasSelectableSketchBounds,
  outputDisplayRect,
  resolvePaintSketchTarget,
  sketchInkScale,
  strokeBelongsToSketch,
  useImageFileDrop,
} from '../authoring/nodes';
import { activateSketch } from '../authoring/nodes/activateSketch';
import { setViewport, setInteractionBusy } from '../authoring/session';
import type { CanvasId, LayerId, NodeId, SublayerId } from '../authoring/ids';
import type { AuthoringWorkspace } from '../authoring/workspace';
import type {
  ActiveTool,
  FrameNode,
  ImageNode,
  NodeRef,
  Rect,
  SketchData,
  SketchNode,
  Stroke,
} from '../authoring/types';
import { nodeRefKey } from '../authoring/types';
import {
  collectOwnedBrushIds,
  hasOrphanSketchPaths,
  repairOrphanSketchPaths,
} from '../authoring/sketch';
import {
  CommittedPathsLayer,
  resolveActiveDrawTarget,
} from './CommittedPathsLayer';
import { CreateRectGesture } from './create';
import { ReactSketchCanvas, type ReactSketchCanvasRef } from './engine';
import {
  BoundingBoxTransformChrome,
  type TransformChromeBox,
  CANVAS_FRAME_FILL,
  FrameCropDim,
  ImageTransformChrome,
  OutputTransformChrome,
  SelectClearBackdrop,
  TransformBoxUnderlay,
  buildMaskRevision,
  contentsPreviewMatrix,
  contentsPreviewScale,
  type OutputTransformDraft,
  type SurfaceTransformDraft,
  type TransformDraft,
} from './transform';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  INFINITE_CANVAS_ORIGIN,
  INFINITE_CANVAS_SIZE,
  ViewportShell,
  useViewportShell,
  type Viewport,
} from './viewport';
import { buildBrushSlotIndexMap } from '../settings/palette';
import { documentEraserStore } from '../settings/eraser';
import { clampSessionActivePaletteId } from '../settings/activePaletteSession';
import { clampSessionActiveEraserId } from '../settings/activeEraserSession';
import { ensureActiveToolStaging } from '../settings/configDomain';
import { strokeToCanvasPath } from './pathUtils';
import { resolveActiveBrush } from './resolveActiveBrush';
import { resolveActiveEraserTip } from './resolveActiveEraserTip';
import { logEraseTarget } from './eraseTargetDebug';
import {
  erasePreviewExcludeForBand,
  erasePreviewPathsOrNull,
  resolveErasePreviewSublayerId,
} from './resolveErasePreview';
import { useLiveStrokeEngine } from './useLiveStrokeEngine';
import {
  isDefaultSessionViewport,
  sessionToShellViewport,
  shellToSessionViewport,
} from './viewportSync';
import { ViewportFitRequest } from './ViewportFitRequest';
import { ImageNodeBitmaps } from './ImageNodeBitmaps';
import { commitCreatedSketch } from '../toolbar/tools/createSketchTool';

type CanvasHostProps = {
  workspace: AuthoringWorkspace;
  canvasLive?: boolean;
};

type CanvasSnapshot = {
  canvasId: CanvasId | null;
  sketch: SketchData | null;
  frames: FrameNode[];
  images: ImageNode[];
  sketches: SketchNode[];
  selection: NodeRef[];
  activeTool: ActiveTool;
  agentMode: boolean;
  activeLayerId: LayerId | null;
  activeSketchId: NodeId | null;
  activePaletteId: string | null;
  activeBrushId: string | null;
  activeEraserId: string | null;
  paintStaging: ReturnType<
    AuthoringWorkspace['sessionStore']['getState']
  >['paintStaging'];
  sessionViewport: ReturnType<
    AuthoringWorkspace['sessionStore']['getState']
  >['viewport'];
  viewportFitRequest: ReturnType<
    AuthoringWorkspace['sessionStore']['getState']
  >['viewportFitRequest'];
  canvasFrameId: NodeId | null;
  containerEditId: NodeId | null;
};

function selectionKeysEqual(a: NodeRef[], b: NodeRef[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (nodeRefKey(a[i]!) !== nodeRefKey(b[i]!)) {
      return false;
    }
  }
  return true;
}

const canvasSnapshotCache = new WeakMap<AuthoringWorkspace, CanvasSnapshot>();

function subscribeCanvasStores(
  workspace: AuthoringWorkspace,
  onStoreChange: () => void,
): () => void {
  const unsubDocument = workspace.documentStore.subscribe(onStoreChange);
  const unsubSession = workspace.sessionStore.subscribe(onStoreChange);
  const unsubErasers = documentEraserStore.subscribe(onStoreChange);
  return () => {
    unsubDocument();
    unsubSession();
    unsubErasers();
  };
}

function getCanvasSnapshot(workspace: AuthoringWorkspace): CanvasSnapshot {
  const documentState = workspace.documentStore.getState();
  const sessionState = workspace.sessionStore.getState();
  const canvasId = sessionState.viewFocus.canvasId;
  const sketch = canvasId ? (documentState.sketches[canvasId] ?? null) : null;
  const frames = canvasId ? framesForCanvas(documentState, canvasId) : [];
  const allImages = canvasId ? imagesForCanvas(documentState, canvasId) : [];
  const hiddenResultIds = new Set<NodeId>();
  for (const frame of frames) {
    if (frame.resultImageId && frameResultView(frame) === 'input') {
      hiddenResultIds.add(frame.resultImageId);
    }
  }
  const images =
    hiddenResultIds.size > 0
      ? allImages.filter((image) => !hiddenResultIds.has(image.id))
      : allImages;
  const sketches = canvasId ? sketchesForCanvas(documentState, canvasId) : [];
  const next: CanvasSnapshot = {
    canvasId,
    sketch,
    frames,
    images,
    sketches,
    selection: Array.from(sessionState.selection),
    activeTool: sessionState.activeTool,
    agentMode: sessionState.agentMode,
    activeLayerId: sessionState.activeLayerId,
    activeSketchId: sessionState.activeSketchId,
    activePaletteId: sessionState.activePaletteId,
    activeBrushId: sessionState.activeBrushId,
    activeEraserId: sessionState.activeEraserId,
    paintStaging: sessionState.paintStaging,
    sessionViewport: sessionState.viewport,
    viewportFitRequest: sessionState.viewportFitRequest,
    canvasFrameId: sessionState.canvasFrameId,
    containerEditId: sessionState.containerEditId,
  };

  const cached = canvasSnapshotCache.get(workspace);
  if (
    cached &&
    cached.canvasId === next.canvasId &&
    cached.sketch === next.sketch &&
    cached.activeTool === next.activeTool &&
    cached.agentMode === next.agentMode &&
    cached.activeLayerId === next.activeLayerId &&
    cached.activeSketchId === next.activeSketchId &&
    cached.activePaletteId === next.activePaletteId &&
    cached.activeBrushId === next.activeBrushId &&
    cached.activeEraserId === next.activeEraserId &&
    cached.paintStaging === next.paintStaging &&
    cached.viewportFitRequest === next.viewportFitRequest &&
    cached.canvasFrameId === next.canvasFrameId &&
    cached.containerEditId === next.containerEditId &&
    cached.sessionViewport.panX === next.sessionViewport.panX &&
    cached.sessionViewport.panY === next.sessionViewport.panY &&
    cached.sessionViewport.zoom === next.sessionViewport.zoom &&
    selectionKeysEqual(cached.selection, next.selection) &&
    cached.frames.length === next.frames.length &&
    cached.frames.every((frame, index) => frame === next.frames[index]) &&
    cached.images.length === next.images.length &&
    cached.images.every((image, index) => image === next.images[index]) &&
    cached.sketches.length === next.sketches.length &&
    cached.sketches.every((box, index) => box === next.sketches[index])
  ) {
    return cached;
  }

  canvasSnapshotCache.set(workspace, next);
  return next;
}

type CanvasSurfaceProps = {
  workspace: AuthoringWorkspace;
  canvasId: CanvasId;
  sketch: SketchData;
  frames: FrameNode[];
  images: ImageNode[];
  sketches: SketchNode[];
  selection: NodeRef[];
  activeTool: ActiveTool;
  agentMode: boolean;
  activeLayerId: LayerId | null;
  activeSketchId: NodeId | null;
  activePaletteId: string | null;
  activeBrushId: string | null;
  activeEraserId: string | null;
  paintStaging: CanvasSnapshot['paintStaging'];
  sessionViewport: CanvasSnapshot['sessionViewport'];
  viewportFitRequest: CanvasSnapshot['viewportFitRequest'];
  canvasFrameId: NodeId | null;
  containerEditId: NodeId | null;
  canvasLive: boolean;
};

const drawPlaneStyle = {
  left: INFINITE_CANVAS_ORIGIN,
  top: INFINITE_CANVAS_ORIGIN,
  width: INFINITE_CANVAS_SIZE,
  height: INFINITE_CANVAS_SIZE,
} as const;

const infiniteViewBox = `${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_SIZE} ${INFINITE_CANVAS_SIZE}`;

function CanvasSurface({
  workspace,
  canvasId,
  sketch,
  frames,
  images,
  sketches,
  selection,
  activeTool,
  agentMode,
  activeLayerId,
  activeSketchId,
  activePaletteId,
  activeBrushId,
  activeEraserId,
  paintStaging,
  sessionViewport,
  viewportFitRequest,
  canvasFrameId,
  containerEditId,
  canvasLive,
}: CanvasSurfaceProps) {
  const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
  const documentState = useSyncExternalStore(
    (onStoreChange) => workspace.documentStore.subscribe(onStoreChange),
    () => workspace.documentStore.getState(),
    () => workspace.documentStore.getState(),
  );

  const activeDrawTarget = resolveActiveDrawTarget(
    sketch,
    activeLayerId,
    activeBrushId,
  );
  const sessionForResolve = useMemo(
    () => ({
      ...workspace.sessionStore.getState(),
      activeTool,
      selection: new Set(selection),
      activePaletteId,
      activeBrushId,
      activeEraserId,
      paintStaging,
    }),
    [
      workspace.sessionStore,
      activeTool,
      selection,
      activePaletteId,
      activeBrushId,
      activeEraserId,
      paintStaging,
    ],
  );
  const liveSketchNodes = useMemo(() => {
    const nodes: Record<string, (typeof sketches)[number]> = {};
    for (const entry of sketches) {
      nodes[entry.id] = entry;
    }
    return nodes;
  }, [sketches]);
  const paintTargetSketchId = useMemo(
    () =>
      resolvePaintSketchTarget(selection, liveSketchNodes) ??
      (activeSketchId && liveSketchNodes[activeSketchId]
        ? activeSketchId
        : null),
    [activeSketchId, liveSketchNodes, selection],
  );
  const paintTargetSketch = paintTargetSketchId
    ? liveSketchNodes[paintTargetSketchId] ?? null
    : null;
  const paintTargetPalettes = paintTargetSketch?.palettes ?? [];
  const activeBrush = resolveActiveBrush(
    sessionForResolve,
    paintTargetPalettes,
    liveSketchNodes,
  );
  const paintTargetSlotMap = useMemo(
    () => buildBrushSlotIndexMap(paintTargetPalettes),
    [paintTargetPalettes],
  );
  const activeSlotIndex =
    activeBrushId != null
      ? (paintTargetSlotMap.get(activeBrushId) ?? -1)
      : -1;
  const activeEraserTip = resolveActiveEraserTip(sessionForResolve);
  const isEraseTool = activeTool === 'erase';
  const inkScale = sketchInkScale(paintTargetSketch);
  const liveStrokeWidth = effectiveStrokeWidth(
    isEraseTool ? activeEraserTip.size : activeBrush.size,
    inkScale,
  );
  const eraserWidth = effectiveStrokeWidth(activeEraserTip.size, inkScale);
  const liveEngineId = activeDrawTarget?.pendingPaletteId
    ? `canvas-pending-${activeDrawTarget.pendingPaletteId}`
    : activeDrawTarget?.sublayerId
      ? `canvas-${activeDrawTarget.sublayerId}`
      : null;

  const selectedPaintSketchId = useMemo(
    () => resolvePaintSketchTarget(selection, liveSketchNodes),
    [liveSketchNodes, selection],
  );
  const createOnStroke =
    activeTool === 'paint' && selectedPaintSketchId == null;

  useLayoutEffect(() => {
    if (selectedPaintSketchId == null) {
      return;
    }
    if (selectedPaintSketchId === activeSketchId) {
      return;
    }
    activateSketch(workspace, selectedPaintSketchId, { select: false });
  }, [activeSketchId, selectedPaintSketchId, workspace]);

  const {
    canDraw,
    handleEngineChange,
    hydrateEnginePaths,
    clearEnginePaths,
  } = useLiveStrokeEngine({
    workspace,
    canvasId,
    sketch,
    activeTool,
    activeLayerId,
    activePaletteId: activeBrushId,
    activeSketchId: selectedPaintSketchId ?? activeSketchId,
    createOnStroke,
    canvasLive,
    canvasRef,
  });

  const eraseTargetSketchId = selectedPaintSketchId ?? activeSketchId;
  const erasePreviewSublayerId = resolveErasePreviewSublayerId({
    isEraseTool,
    eraseTargetSketchId,
    activeSublayerId: activeDrawTarget?.sublayerId,
  });

  const soleSketch = sketches.length === 1;

  // Heal create-on-stroke split ink: paths keyed by staging/foreign brush ids
  // moved onto the Sketch's owned brush sublayer before erase hydrate.
  useLayoutEffect(() => {
    if (!isEraseTool || eraseTargetSketchId == null || activeBrushId == null) {
      return;
    }
    const sketchNode = liveSketchNodes[eraseTargetSketchId];
    if (!sketchNode) {
      return;
    }
    const ownedBrushIds = collectOwnedBrushIds(sketchNode.palettes ?? []);
    if (!hasOrphanSketchPaths(sketch, eraseTargetSketchId, ownedBrushIds)) {
      return;
    }
    workspace.documentStore.setState((draft) => {
      const canvasSketch = draft.sketches[canvasId];
      if (!canvasSketch) {
        return;
      }
      repairOrphanSketchPaths({
        sketch: canvasSketch,
        sketchId: eraseTargetSketchId,
        ownedBrushIds,
        destinationBrushId: activeBrushId,
      });
    });
    logEraseTarget({
      activeTool,
      eraseTargetSketchId,
      activeBrushId,
      sublayerId: activeDrawTarget?.sublayerId,
      erasePreviewSublayerId,
      pathCount: 0,
      liveEngineId,
      reason: 'repair-orphans',
    });
  }, [
    activeBrushId,
    activeDrawTarget?.sublayerId,
    activeTool,
    canvasId,
    erasePreviewSublayerId,
    eraseTargetSketchId,
    isEraseTool,
    liveEngineId,
    liveSketchNodes,
    sketch,
    workspace.documentStore,
  ]);

  const erasePreviewPaths = useMemo(() => {
    if (!erasePreviewSublayerId || eraseTargetSketchId == null) {
      return null;
    }
    const layer = sketch.layers.find(
      (item) => item.id === activeDrawTarget?.layerId,
    );
    const sublayer = layer?.sublayers.find(
      (item) => item.id === erasePreviewSublayerId,
    );
    const paths = (sublayer?.paths ?? [])
      .filter(
        (path) =>
          path.sketchId === eraseTargetSketchId ||
          (path.sketchId == null && soleSketch),
      )
      .map(strokeToCanvasPath);
    return erasePreviewPathsOrNull(paths);
  }, [
    activeDrawTarget?.layerId,
    eraseTargetSketchId,
    erasePreviewSublayerId,
    sketch,
    soleSketch,
  ]);

  const wantsErasePreview = erasePreviewPaths !== null;
  // Only hide the committed sublayer once the live engine owns its paths —
  // avoids a blank frame on paint ↔ erase tool switches.
  const [engineOwnsEraseSublayer, setEngineOwnsEraseSublayer] = useState(false);

  useLayoutEffect(() => {
    if (!isEraseTool) {
      setEngineOwnsEraseSublayer(false);
      return;
    }

    if (wantsErasePreview && erasePreviewPaths) {
      logEraseTarget({
        activeTool,
        eraseTargetSketchId,
        activeBrushId,
        sublayerId: activeDrawTarget?.sublayerId,
        erasePreviewSublayerId,
        pathCount: erasePreviewPaths.length,
        liveEngineId,
        reason: 'hydrate',
      });
      hydrateEnginePaths(erasePreviewPaths);
      setEngineOwnsEraseSublayer(true);
      return;
    }

    logEraseTarget({
      activeTool,
      eraseTargetSketchId,
      activeBrushId,
      sublayerId: activeDrawTarget?.sublayerId,
      erasePreviewSublayerId,
      pathCount: 0,
      liveEngineId,
      reason:
        eraseTargetSketchId == null || erasePreviewSublayerId == null
          ? 'skip-no-target'
          : 'skip-empty',
    });
    setEngineOwnsEraseSublayer(false);
  }, [
    activeBrushId,
    activeDrawTarget?.sublayerId,
    activeTool,
    erasePreviewPaths,
    erasePreviewSublayerId,
    eraseTargetSketchId,
    hydrateEnginePaths,
    isEraseTool,
    liveEngineId,
    wantsErasePreview,
  ]);

  useLayoutEffect(() => {
    if (!wantsErasePreview && !engineOwnsEraseSublayer) {
      clearEnginePaths();
    }
  }, [clearEnginePaths, engineOwnsEraseSublayer, wantsErasePreview]);

  const excludeCommittedSublayerId =
    engineOwnsEraseSublayer && erasePreviewSublayerId
      ? erasePreviewSublayerId
      : null;

  const [transformDraft, setTransformDraft] = useState<TransformDraft | null>(
    null,
  );

  const handleTransformDraftChange = useCallback(
    (draft: SurfaceTransformDraft | null) => {
      setTransformDraft(draft);
      setInteractionBusy(workspace.sessionStore, draft != null);
    },
    [workspace.sessionStore],
  );
  const selectableBoxes = useMemo((): TransformChromeBox[] => {
    return canvasSelectEntries(documentState, canvasId, containerEditId)
      .filter(
        (entry) => entry.kind === 'sketch' || entry.kind === 'container',
      )
      .map((entry) => entry.node as TransformChromeBox)
      .filter(
        (box) =>
          box.visible &&
          !box.locked &&
          hasSelectableSketchBounds(box.canvas),
      );
  }, [canvasId, documentState, containerEditId]);
  const selectedBoxIds = useMemo(() => {
    const ids = new Set<NodeId>();
    for (const ref of selection) {
      if (ref.type === 'sketch' || ref.type === 'container') {
        ids.add(ref.id);
      }
    }
    return ids;
  }, [selection]);
  const selectToolActive = activeTool === 'select';
  /** Transform chrome requires Select + at least one selectable box. */
  const chromeInteractive =
    selectToolActive && selectableBoxes.length > 0;
  const chromeBoxes = useMemo(() => {
    if (
      agentMode ||
      activeTool === 'paint' ||
      activeTool === 'erase'
    ) {
      return selectableBoxes.filter((box) => selectedBoxIds.has(box.id));
    }
    if (activeTool === 'select') {
      return selectableBoxes;
    }
    return [];
  }, [activeTool, agentMode, selectableBoxes, selectedBoxIds]);
  const showChrome = chromeBoxes.length > 0;
  const transformingSketchIds = useMemo(() => {
    if (!transformDraft) {
      return new Set<NodeId>();
    }
    const ids = new Set<NodeId>();
    for (const box of sketches) {
      if (transformDraft.draftById.has(String(box.id))) {
        ids.add(box.id);
      }
    }
    return ids;
  }, [sketches, transformDraft]);
  const soleSketchId = soleSketch ? sketches[0]?.id ?? null : null;
  const pathBelongsTo = useCallback(
    (sketchNodeId: NodeId) => (path: Stroke) =>
      strokeBelongsToSketch(path, sketchNodeId, soleSketchId),
    [soleSketchId],
  );

  const handleViewportChange = useCallback(
    (viewport: Viewport) => {
      setViewport(workspace.sessionStore, shellToSessionViewport(viewport));
    },
    [workspace.sessionStore],
  );

  const handleZoomChange = useCallback(
    (zoom: number) => {
      const current = workspace.sessionStore.getState().viewport;
      if (current.zoom === zoom) {
        return;
      }
      setViewport(workspace.sessionStore, { ...current, zoom });
    },
    [workspace.sessionStore],
  );

  const handleCreateSketchCommit = useCallback(
    (rect: Rect) => {
      commitCreatedSketch(workspace, canvasId, rect);
    },
    [canvasId, workspace],
  );

  const artboardCenterRect = {
    x: 0,
    y: 0,
    width: sketch.width,
    height: sketch.height,
  };
  const fitRect = viewportFitRequest?.rect ?? null;
  const initialCenterRect = fitRect ?? artboardCenterRect;
  /** Frame Edit: center on crop; keep Graph zoom from the fit request. */
  const initialViewport =
    fitRect != null || isDefaultSessionViewport(sessionViewport)
      ? undefined
      : sessionToShellViewport(sessionViewport);

  return (
    <ViewportShell
      worldWidth={BOARD_WIDTH}
      worldHeight={BOARD_HEIGHT}
      infiniteCanvas
      showWorldBorder={false}
      initialCenterRect={initialCenterRect}
      initialCenterZoom={viewportFitRequest?.zoom}
      initialViewport={initialViewport}
      onViewportChange={handleViewportChange}
      onZoomChange={handleZoomChange}
      paneClassName="h-full w-full"
    >
      <ViewportFitRequest workspace={workspace} />
      <CanvasDrawPlane
        workspace={workspace}
        canvasId={canvasId}
        sketch={sketch}
        frames={frames}
        images={images}
        sketches={sketches}
        selection={selection}
        activeTool={activeTool}
        agentMode={agentMode}
        canvasFrameId={canvasFrameId}
        containerEditId={containerEditId}
        canvasLive={canvasLive}
        canvasRef={canvasRef}
        transformDraft={transformDraft}
        transformingSketchIds={transformingSketchIds}
        selectedPaintSketchId={selectedPaintSketchId}
        activeSketchId={activeSketchId}
        createOnStroke={createOnStroke}
        activeDrawTarget={activeDrawTarget}
        liveEngineId={liveEngineId}
        activeBrush={activeBrush}
        liveStrokeWidth={liveStrokeWidth}
        eraserWidth={eraserWidth}
        isEraseTool={isEraseTool}
        handleEngineChange={handleEngineChange}
        canDraw={canDraw}
        activeSlotIndex={activeSlotIndex}
        excludeCommittedSublayerId={excludeCommittedSublayerId}
        eraseTargetSketchId={eraseTargetSketchId}
        pathBelongsTo={pathBelongsTo}
        sessionZoom={sessionViewport.zoom}
        selectToolActive={selectToolActive}
        showChrome={showChrome}
        chromeBoxes={chromeBoxes}
        chromeInteractive={chromeInteractive}
        handleTransformDraftChange={handleTransformDraftChange}
        handleCreateSketchCommit={handleCreateSketchCommit}
      />
    </ViewportShell>
  );
}

type CanvasDrawPlaneProps = {
  workspace: AuthoringWorkspace;
  canvasId: CanvasId;
  sketch: SketchData;
  frames: FrameNode[];
  images: ImageNode[];
  sketches: SketchNode[];
  selection: NodeRef[];
  activeTool: ActiveTool;
  agentMode: boolean;
  canvasFrameId: NodeId | null;
  containerEditId: NodeId | null;
  canvasLive: boolean;
  canvasRef: MutableRefObject<ReactSketchCanvasRef | null>;
  transformDraft: TransformDraft | null;
  transformingSketchIds: ReadonlySet<NodeId>;
  selectedPaintSketchId: NodeId | null;
  activeSketchId: NodeId | null;
  createOnStroke: boolean;
  activeDrawTarget: ReturnType<typeof resolveActiveDrawTarget>;
  liveEngineId: string | null;
  activeBrush: ReturnType<typeof resolveActiveBrush>;
  liveStrokeWidth: number;
  eraserWidth: number;
  isEraseTool: boolean;
  handleEngineChange: ReturnType<typeof useLiveStrokeEngine>['handleEngineChange'];
  canDraw: boolean;
  activeSlotIndex: number;
  excludeCommittedSublayerId: SublayerId | null;
  eraseTargetSketchId: NodeId | null;
  pathBelongsTo: (sketchNodeId: NodeId) => (path: Stroke) => boolean;
  sessionZoom: number;
  selectToolActive: boolean;
  showChrome: boolean;
  chromeBoxes: TransformChromeBox[];
  chromeInteractive: boolean;
  handleTransformDraftChange: (draft: TransformDraft | null) => void;
  handleCreateSketchCommit: (rect: Rect) => void;
};

function CanvasDrawPlane({
  workspace,
  canvasId,
  sketch,
  frames,
  images,
  sketches,
  selection,
  activeTool,
  agentMode,
  canvasFrameId,
  containerEditId,
  canvasLive,
  canvasRef,
  transformDraft,
  transformingSketchIds,
  selectedPaintSketchId,
  activeSketchId,
  createOnStroke,
  activeDrawTarget,
  liveEngineId,
  activeBrush,
  liveStrokeWidth,
  eraserWidth,
  isEraseTool,
  handleEngineChange,
  canDraw,
  activeSlotIndex,
  excludeCommittedSublayerId,
  eraseTargetSketchId,
  pathBelongsTo,
  sessionZoom,
  selectToolActive,
  showChrome,
  chromeBoxes,
  chromeInteractive,
  handleTransformDraftChange,
  handleCreateSketchCommit,
}: CanvasDrawPlaneProps) {
  const { screenToWorld } = useViewportShell();
  const documentState = useSyncExternalStore(
    (onStoreChange) => workspace.documentStore.subscribe(onStoreChange),
    () => workspace.documentStore.getState(),
    () => workspace.documentStore.getState(),
  );
  const [outputDraft, setOutputDraft] = useState<OutputTransformDraft | null>(
    null,
  );
  const imageDraftById = transformDraft?.draftById ?? null;
  const outputDraftById = useMemo(() => {
    if (!outputDraft) return null;
    return new Map([[outputDraft.outputId, outputDraft.rect]]);
  }, [outputDraft]);

  /** Agent mode: focus owners only — Output underlay / chrome host. */
  const agentOwnerIds = useMemo(
    () => (agentMode ? agentFocusOwnerIds(selection) : null),
    [agentMode, selection],
  );
  /** Agent mode: owners + Group members for ink solo (session presentation). */
  const agentSoloIds = useMemo(
    () =>
      agentMode ? agentSoloContentIds(selection, documentState) : null,
    [agentMode, documentState, selection],
  );
  const soloFrames = useMemo(
    () =>
      agentSoloIds
        ? frames.filter((frame) => agentSoloIds.has(frame.id))
        : frames,
    [agentSoloIds, frames],
  );
  const soloImages = useMemo(
    () =>
      agentSoloIds
        ? images.filter((image) => agentSoloIds.has(image.id))
        : images,
    [agentSoloIds, images],
  );
  const soloSketches = useMemo(
    () =>
      agentSoloIds
        ? sketches.filter((box) => agentSoloIds.has(box.id))
        : sketches,
    [agentSoloIds, sketches],
  );
  /** Full Canvas stack for ink / bitmap draw order (includes grouped member Sketches). */
  const inkSurfaceStack = useMemo(
    () => [...soloImages, ...soloSketches].sort(comparePeerStackOrder),
    [soloImages, soloSketches],
  );
  /** Select projection stack for transform chrome hit order. */
  const surfaceStack = useMemo(() => {
    const entries = canvasSelectEntries(documentState, canvasId, containerEditId);
    const boxes = entries
      .filter(
        (entry) => entry.kind === 'sketch' || entry.kind === 'container',
      )
      .map((entry) => entry.node)
      .filter(
        (node) =>
          node.visible &&
          !node.locked &&
          hasSelectableSketchBounds(node.canvas),
      );
    const visibleImages = soloImages.filter(
      (image) => image.visible !== false && !image.locked,
    );
    const stackedBoxes = agentSoloIds
      ? boxes.filter((box) => agentSoloIds.has(box.id))
      : boxes;
    return [...visibleImages, ...stackedBoxes].sort(comparePeerStackOrder);
  }, [agentSoloIds, canvasId, documentState, containerEditId, soloImages]);
  const sketchChromeBoxes = useMemo(() => {
    if (!showChrome) {
      return [] as TransformChromeBox[];
    }
    return agentSoloIds
      ? chromeBoxes.filter((box) => agentSoloIds.has(box.id))
      : chromeBoxes;
  }, [agentSoloIds, chromeBoxes, showChrome]);
  const transformChromeById = useMemo(() => {
    const map = new Map<string, TransformChromeBox>();
    for (const box of sketchChromeBoxes) {
      map.set(box.id, box);
    }
    return map;
  }, [sketchChromeBoxes]);

  const frameCropDimRect = useMemo(() => {
    if (agentMode || !canvasFrameId) return null;
    const frame = soloFrames.find(
      (entry) => entry.id === canvasFrameId && entry.visible,
    );
    return frame ? { ...frame.crop } : null;
  }, [agentMode, canvasFrameId, soloFrames]);

  /** Agent Output white — TransformBoxUnderlay below ink (owners only, not Group members). */
  const outputUnderlayBoxes = useMemo(() => {
    if (!agentOwnerIds) return [] as { id: string; rect: Rect }[];
    const boxes: { id: string; rect: Rect }[] = [];
    for (const ownerId of agentOwnerIds) {
      const output = findOutputForOwner(documentState, ownerId);
      if (!output) continue;
      const rect = outputDisplayRect(documentState, output);
      if (!rect) continue;
      boxes.push({ id: output.id, rect });
    }
    return boxes;
  }, [agentOwnerIds, documentState]);

  /** Frame Edit: full-plane white paper; Agent mode: Output underlay boxes. */
  const underlayBoxes = agentMode ? outputUnderlayBoxes : [];
  const underlayDraftById = agentMode ? outputDraftById : null;
  const frameEditPaper = frameCropDimRect != null;

  useImageFileDrop({
    workspace,
    surface: { kind: 'canvas', canvasId },
    activeTool,
    chromeLive: canvasLive,
    clientToWorld: screenToWorld,
  });

  useEffect(() => {
    if (!agentMode) {
      setOutputDraft(null);
    }
  }, [agentMode]);

  return (
    <div className="relative">
      <div className="absolute" style={drawPlaneStyle}>
        <div className="absolute inset-0">
          {frameEditPaper ? (
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: CANVAS_FRAME_FILL,
                pointerEvents: 'none',
              }}
              aria-hidden
            />
          ) : underlayBoxes.length > 0 ? (
            <TransformBoxUnderlay
              fill={CANVAS_FRAME_FILL}
              boxes={underlayBoxes}
              draftById={underlayDraftById}
            />
          ) : null}
          {/* Bottom → top surface stack (Image + Sketch interleaved by stackOrder). */}
          {inkSurfaceStack.map((entry) => {
            if (entry.type === 'image') {
              return (
                <ImageNodeBitmaps
                  key={entry.id}
                  workspace={workspace}
                  images={[entry]}
                  draftById={imageDraftById}
                />
              );
            }

            const sketchNode = entry;
            if (sketchNode.type !== 'sketch') {
              return null;
            }
            if (!sketchNode.visible) {
              return null;
            }
            if (transformingSketchIds.has(sketchNode.id)) {
              return null;
            }
            const belongs = pathBelongsTo(sketchNode.id);
            const structureTargetId =
              selectedPaintSketchId ?? activeSketchId;
            const isPaintTarget =
              !createOnStroke && sketchNode.id === structureTargetId;
            const suffix = `-s-${sketchNode.id}`;
            const slotIndexByBrushId = buildBrushSlotIndexMap(
              sketchNode.palettes ?? [],
            );
            const excludeSublayerId = erasePreviewExcludeForBand(
              excludeCommittedSublayerId,
              sketchNode.id,
              eraseTargetSketchId,
            );

            if (!isPaintTarget) {
              return (
                <CommittedPathsLayer
                  key={sketchNode.id}
                  sketch={sketch}
                  viewBox={infiniteViewBox}
                  excludeSublayerId={excludeSublayerId}
                  slotIndexByBrushId={slotIndexByBrushId}
                  pathFilter={belongs}
                  idSuffix={suffix}
                />
              );
            }

            return (
              <div key={sketchNode.id} className="absolute inset-0">
                <CommittedPathsLayer
                  sketch={sketch}
                  viewBox={infiniteViewBox}
                  excludeSublayerId={excludeSublayerId}
                  slotIndexByBrushId={slotIndexByBrushId}
                  slotFilter={(slot) => slot < 0 || slot >= activeSlotIndex}
                  pathFilter={belongs}
                  idSuffix={`${suffix}-below`}
                />

                {activeDrawTarget && liveEngineId ? (
                  <ReactSketchCanvas
                    ref={canvasRef}
                    id={liveEngineId}
                    className="absolute inset-0 h-full w-full"
                    width={INFINITE_CANVAS_SIZE}
                    height={INFINITE_CANVAS_SIZE}
                    viewBoxMinX={INFINITE_CANVAS_ORIGIN}
                    viewBoxMinY={INFINITE_CANVAS_ORIGIN}
                    strokeColor={activeBrush.color}
                    strokeWidth={liveStrokeWidth}
                    strokeOpacity={activeBrush.opacity}
                    eraserWidth={eraserWidth}
                    eraserMode="mask"
                    eraseActive={isEraseTool}
                    onChange={handleEngineChange}
                    style={{ pointerEvents: canDraw ? 'auto' : 'none' }}
                  />
                ) : null}

                <CommittedPathsLayer
                  sketch={sketch}
                  viewBox={infiniteViewBox}
                  excludeSublayerId={excludeSublayerId}
                  slotIndexByBrushId={slotIndexByBrushId}
                  slotFilter={(slot) => slot >= 0 && slot < activeSlotIndex}
                  pathFilter={belongs}
                  idSuffix={`${suffix}-above`}
                />
              </div>
            );
          })}

          {createOnStroke && activeDrawTarget && liveEngineId ? (
            <div className="absolute inset-0">
              <ReactSketchCanvas
                ref={canvasRef}
                id={`${liveEngineId}-create`}
                className="absolute inset-0 h-full w-full"
                width={INFINITE_CANVAS_SIZE}
                height={INFINITE_CANVAS_SIZE}
                viewBoxMinX={INFINITE_CANVAS_ORIGIN}
                viewBoxMinY={INFINITE_CANVAS_ORIGIN}
                strokeColor={activeBrush.color}
                strokeWidth={liveStrokeWidth}
                strokeOpacity={activeBrush.opacity}
                eraserWidth={eraserWidth}
                eraserMode="mask"
                eraseActive={isEraseTool}
                onChange={handleEngineChange}
                style={{ pointerEvents: canDraw ? 'auto' : 'none' }}
              />
            </div>
          ) : null}

          {transformDraft
            ? soloSketches.map((sketchNode) => {
                if (
                  !sketchNode.visible ||
                  !transformingSketchIds.has(sketchNode.id)
                ) {
                  return null;
                }
                const base = transformDraft.baseById.get(String(sketchNode.id));
                const next = transformDraft.draftById.get(
                  String(sketchNode.id),
                );
                if (!base || !next) {
                  return null;
                }
                const previewScale = contentsPreviewScale(base, next);
                return (
                  <div
                    key={`drag-${sketchNode.id}`}
                    className="absolute inset-0"
                    style={{
                      transform: contentsPreviewMatrix(
                        base,
                        next,
                        INFINITE_CANVAS_ORIGIN,
                      ),
                      transformOrigin: '0 0',
                    }}
                  >
                    <CommittedPathsLayer
                      sketch={sketch}
                      viewBox={infiniteViewBox}
                      excludeSublayerId={erasePreviewExcludeForBand(
                        excludeCommittedSublayerId,
                        sketchNode.id,
                        eraseTargetSketchId,
                      )}
                      slotIndexByBrushId={buildBrushSlotIndexMap(
                        sketchNode.palettes ?? [],
                      )}
                      pathFilter={pathBelongsTo(sketchNode.id)}
                      idSuffix={`-drag-${sketchNode.id}`}
                      maskRevision={buildMaskRevision({
                        zoom: sessionZoom,
                        sx: previewScale.sx,
                        sy: previewScale.sy,
                      })}
                    />
                  </div>
                );
              })
            : null}
        </div>

        {frameCropDimRect ? <FrameCropDim crop={frameCropDimRect} /> : null}

        {selectToolActive && !agentMode ? (
          <SelectClearBackdrop workspace={workspace} active />
        ) : null}

        {/* Select hits follow surface stack — same order as paint (not type bands).
            Agent mode: Sketch persist outline only (non-interactive); Image chrome stays hidden. */}
        {surfaceStack.map((entry) => {
          if (entry.type === 'image') {
            if (agentMode) {
              return null;
            }
            return (
              <ImageTransformChrome
                key={`chrome-${entry.id}`}
                workspace={workspace}
                images={[entry]}
                selection={selection}
                interactive={selectToolActive}
                peerDraftById={transformDraft?.draftById}
                onDraftChange={handleTransformDraftChange}
              />
            );
          }
          const box = transformChromeById.get(entry.id);
          if (!box) {
            return null;
          }
          return (
            <BoundingBoxTransformChrome
              key={`chrome-${entry.id}`}
              workspace={workspace}
              boxes={[box]}
              selection={selection}
              interactive={chromeInteractive && !agentMode}
              peerDraftById={transformDraft?.draftById}
              onDraftChange={handleTransformDraftChange}
            />
          );
        })}

        <OutputTransformChrome
          workspace={workspace}
          selection={selection}
          active={agentMode}
          canvasId={canvasId}
          onDraftChange={(draft) => {
            setOutputDraft(draft);
            setInteractionBusy(workspace.sessionStore, draft != null);
          }}
        />

        <CreateRectGesture
          active={activeTool === 'createSketch'}
          onCommit={handleCreateSketchCommit}
        />
      </div>
    </div>
  );
}

export function CanvasHost({ workspace, canvasLive = true }: CanvasHostProps) {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => subscribeCanvasStores(workspace, onStoreChange),
    () => getCanvasSnapshot(workspace),
    () => getCanvasSnapshot(workspace),
  );

  useEffect(() => {
    clampSessionActivePaletteId(workspace);
    clampSessionActiveEraserId(workspace.sessionStore);
    ensureActiveToolStaging(workspace.sessionStore);
    const unsubDocument = workspace.documentStore.subscribe(() => {
      clampSessionActivePaletteId(workspace);
    });
    const unsubErasers = documentEraserStore.subscribe(() => {
      clampSessionActiveEraserId(workspace.sessionStore);
    });
    const unsubSession = workspace.sessionStore.subscribe(() => {
      clampSessionActivePaletteId(workspace);
      clampSessionActiveEraserId(workspace.sessionStore);
      ensureActiveToolStaging(workspace.sessionStore);
    });
    return () => {
      unsubDocument();
      unsubErasers();
      unsubSession();
    };
  }, [workspace]);

  if (!snapshot.canvasId || !snapshot.sketch) {
    return null;
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      <CanvasSurface
        key={snapshot.canvasId}
        workspace={workspace}
        canvasId={snapshot.canvasId}
        sketch={snapshot.sketch}
        frames={snapshot.frames}
        images={snapshot.images}
        sketches={snapshot.sketches}
        selection={snapshot.selection}
        activeTool={snapshot.activeTool}
        agentMode={snapshot.agentMode}
        activeLayerId={snapshot.activeLayerId}
        activeSketchId={snapshot.activeSketchId}
        activePaletteId={snapshot.activePaletteId}
        activeBrushId={snapshot.activeBrushId}
        activeEraserId={snapshot.activeEraserId}
        paintStaging={snapshot.paintStaging}
        sessionViewport={snapshot.sessionViewport}
        viewportFitRequest={snapshot.viewportFitRequest}
        canvasFrameId={snapshot.canvasFrameId}
        containerEditId={snapshot.containerEditId}
        canvasLive={canvasLive}
      />
    </div>
  );
}
