import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  framesForGraph,
  frameCardRect,
  imageRect,
  imagesForCanvas,
  imagesForGraph,
  sketchesForCanvas,
} from '../authoring/document';
import {
  comparePeerStackOrder,
  useImageFileDrop,
} from '../authoring/nodes';
import { FRAME_CHROME } from '../authoring/nodes/nodeChrome';
import { setViewport, setInteractionBusy } from '../authoring/session';
import type { AuthoringWorkspace } from '../authoring/workspace';
import type {
  ActiveTool,
  FrameNode,
  ImageNode,
  NodeRef,
  Rect,
  SketchData,
  SketchNode,
} from '../authoring/types';
import { nodeRefKey } from '../authoring/types';
import { resolveFramePreferences } from '../settings/resolveFramePreferences';
import { CreateRectGesture } from './create';
import { FrameCardPreview } from './FrameCardPreview';
import { ImageNodeBitmaps } from './ImageNodeBitmaps';
import {
  FrameTransformChrome,
  GraphSnapGuides,
  ImageTransformChrome,
  SelectClearBackdrop,
  emptySnapGuides,
  type SnapGuideState,
  type SurfaceTransformDraft,
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
import {
  isDefaultSessionViewport,
  sessionToShellViewport,
  shellToSessionViewport,
} from './viewportSync';
import { commitCreatedFrame } from '../toolbar/tools/createFrameTool';

type GraphHostProps = {
  workspace: AuthoringWorkspace;
  /** Chrome live gate (idle authoring) — same as CanvasHost. */
  canvasLive?: boolean;
};

/** Same infinite draw plane CanvasHost uses so absolute chrome/gesture layers get a hit box. */
const drawPlaneStyle = {
  left: INFINITE_CANVAS_ORIGIN,
  top: INFINITE_CANVAS_ORIGIN,
  width: INFINITE_CANVAS_SIZE,
  height: INFINITE_CANVAS_SIZE,
} as const;

type GraphSnapshot = {
  graphId: string | null;
  frames: FrameNode[];
  images: ImageNode[];
  /** Unique canvas ids among frames (stable order). */
  previewCanvasIds: string[];
  sketchesByCanvasId: Map<string, SketchData | null>;
  sketchNodesByCanvasId: Map<string, SketchNode[]>;
  imagesByCanvasId: Map<string, ImageNode[]>;
  selection: NodeRef[];
  activeTool: ActiveTool;
  agentMode: boolean;
  sessionViewport: ReturnType<
    AuthoringWorkspace['sessionStore']['getState']
  >['viewport'];
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

function previewMapsEqual(a: GraphSnapshot, b: GraphSnapshot): boolean {
  if (a.previewCanvasIds.length !== b.previewCanvasIds.length) return false;
  for (let i = 0; i < a.previewCanvasIds.length; i += 1) {
    const canvasId = a.previewCanvasIds[i]!;
    if (canvasId !== b.previewCanvasIds[i]) return false;
    if (a.sketchesByCanvasId.get(canvasId) !== b.sketchesByCanvasId.get(canvasId)) {
      return false;
    }
    const nodesA = a.sketchNodesByCanvasId.get(canvasId) ?? [];
    const nodesB = b.sketchNodesByCanvasId.get(canvasId) ?? [];
    if (nodesA.length !== nodesB.length) return false;
    if (!nodesA.every((node, index) => node === nodesB[index])) {
      return false;
    }
    const imagesA = a.imagesByCanvasId.get(canvasId) ?? [];
    const imagesB = b.imagesByCanvasId.get(canvasId) ?? [];
    if (imagesA.length !== imagesB.length) return false;
    if (!imagesA.every((node, index) => node === imagesB[index])) {
      return false;
    }
  }
  return true;
}

const graphSnapshotCache = new WeakMap<AuthoringWorkspace, GraphSnapshot>();

function subscribeGraphStores(
  workspace: AuthoringWorkspace,
  onStoreChange: () => void,
): () => void {
  const unsubDocument = workspace.documentStore.subscribe(onStoreChange);
  const unsubSession = workspace.sessionStore.subscribe(onStoreChange);
  return () => {
    unsubDocument();
    unsubSession();
  };
}

function getGraphSnapshot(workspace: AuthoringWorkspace): GraphSnapshot {
  const documentState = workspace.documentStore.getState();
  const sessionState = workspace.sessionStore.getState();
  const { graphId, canvasId } = sessionState.viewFocus;
  const frames =
    graphId && canvasId == null
      ? framesForGraph(documentState, graphId)
      : [];
  const images =
    graphId && canvasId == null ? imagesForGraph(documentState) : [];

  const previewCanvasIds: string[] = [];
  const sketchesByCanvasId = new Map<string, SketchData | null>();
  const sketchNodesByCanvasId = new Map<string, SketchNode[]>();
  const imagesByCanvasId = new Map<string, ImageNode[]>();
  for (const frame of frames) {
    const id = frame.canvasId;
    if (sketchesByCanvasId.has(id)) continue;
    previewCanvasIds.push(id);
    sketchesByCanvasId.set(id, documentState.sketches[id] ?? null);
    sketchNodesByCanvasId.set(id, sketchesForCanvas(documentState, id));
    imagesByCanvasId.set(id, imagesForCanvas(documentState, id));
  }

  const next: GraphSnapshot = {
    graphId,
    frames,
    images,
    previewCanvasIds,
    sketchesByCanvasId,
    sketchNodesByCanvasId,
    imagesByCanvasId,
    selection: Array.from(sessionState.selection),
    activeTool: sessionState.activeTool,
    agentMode: sessionState.agentMode,
    sessionViewport: sessionState.viewport,
  };

  const cached = graphSnapshotCache.get(workspace);
  if (
    cached &&
    cached.graphId === next.graphId &&
    cached.activeTool === next.activeTool &&
    cached.agentMode === next.agentMode &&
    cached.sessionViewport.panX === next.sessionViewport.panX &&
    cached.sessionViewport.panY === next.sessionViewport.panY &&
    cached.sessionViewport.zoom === next.sessionViewport.zoom &&
    selectionKeysEqual(cached.selection, next.selection) &&
    cached.frames.length === next.frames.length &&
    cached.frames.every((frame, index) => frame === next.frames[index]) &&
    cached.images.length === next.images.length &&
    cached.images.every((image, index) => image === next.images[index]) &&
    previewMapsEqual(cached, next)
  ) {
    return cached;
  }

  graphSnapshotCache.set(workspace, next);
  return next;
}

type GraphBoardProps = {
  workspace: AuthoringWorkspace;
  snapshot: GraphSnapshot;
  canvasLive: boolean;
  surfaceDraft: SurfaceTransformDraft | null;
  setSurfaceDraft: (draft: SurfaceTransformDraft | null) => void;
  snapGuides: SnapGuideState;
  snapGuideColor: string;
  setSnapGuides: (guides: SnapGuideState, color: string | null) => void;
};

function graphSnapCandidates(
  surfaceStack: ReadonlyArray<FrameNode | ImageNode>,
  excludeRefs: readonly NodeRef[],
): Rect[] {
  const excluded = new Set(excludeRefs.map(nodeRefKey));
  const rects: Rect[] = [];
  for (const entry of surfaceStack) {
    const ref: NodeRef =
      entry.type === 'frame'
        ? { type: 'frame', id: entry.id }
        : { type: 'image', id: entry.id };
    if (excluded.has(nodeRefKey(ref))) {
      continue;
    }
    if (entry.visible === false || entry.locked) {
      continue;
    }
    rects.push(entry.type === 'frame' ? frameCardRect(entry) : imageRect(entry));
  }
  return rects;
}

function GraphBoard({
  workspace,
  snapshot,
  canvasLive,
  surfaceDraft,
  setSurfaceDraft,
  snapGuides,
  snapGuideColor,
  setSnapGuides,
}: GraphBoardProps) {
  const { screenToWorld } = useViewportShell();
  const framePrefs = resolveFramePreferences();
  const selectLatched = snapshot.activeTool === 'select';
  // Image chrome still hides in Agent mode (Output framing is Canvas-only).
  // Frame card chrome stays — Graph has no Output widget; Frame is the Graph transform surface.
  const chromeInteractive = selectLatched && !snapshot.agentMode;
  const frameChromeInteractive = selectLatched;

  /** Unified Graph surface stack (Frame + Image), ascending stackOrder. */
  const surfaceStack = useMemo(
    () =>
      [...snapshot.frames, ...snapshot.images].sort(comparePeerStackOrder),
    [snapshot.frames, snapshot.images],
  );

  const handleSurfaceDraftChange = useCallback(
    (draft: SurfaceTransformDraft | null) => {
      setSurfaceDraft(draft);
      setInteractionBusy(workspace.sessionStore, draft != null);
      if (draft == null) {
        setSnapGuides(emptySnapGuides(), null);
      }
    },
    [setSnapGuides, setSurfaceDraft, workspace.sessionStore],
  );

  const getSnapCandidates = useCallback(
    (excludeRefs: readonly NodeRef[]) =>
      graphSnapCandidates(surfaceStack, excludeRefs),
    [surfaceStack],
  );

  const handleSnapGuidesChange = useCallback(
    (guides: SnapGuideState, color: string) => {
      setSnapGuides(guides, color);
    },
    [setSnapGuides],
  );

  const getCreateSnapCandidates = useCallback(
    () => graphSnapCandidates(surfaceStack, []),
    [surfaceStack],
  );

  const handleCreateSnapGuidesChange = useCallback(
    (guides: SnapGuideState) => {
      setSnapGuides(guides, FRAME_CHROME.outline);
    },
    [setSnapGuides],
  );

  const imageDraftById = surfaceDraft?.draftById ?? null;

  useImageFileDrop({
    workspace,
    surface: { kind: 'graph' },
    activeTool: snapshot.activeTool,
    chromeLive: canvasLive,
    clientToWorld: screenToWorld,
  });

  const handleCreateFrameCommit = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      const graphId = workspace.sessionStore.getState().viewFocus.graphId;
      if (!graphId) {
        return;
      }
      commitCreatedFrame(workspace, graphId, rect);
    },
    [workspace],
  );

  return (
    <div className="absolute" style={drawPlaneStyle}>
      <div className="absolute inset-0">
        {chromeInteractive ? (
          <SelectClearBackdrop workspace={workspace} active />
        ) : null}
        {surfaceStack.map((entry) => {
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
          return (
            <FrameCardPreview
              key={entry.id}
              workspace={workspace}
              frames={[entry]}
              sketchesByCanvasId={snapshot.sketchesByCanvasId}
              sketchNodesByCanvasId={snapshot.sketchNodesByCanvasId}
              imagesByCanvasId={snapshot.imagesByCanvasId}
              transformDraft={surfaceDraft}
            />
          );
        })}
        {/* Select hits follow surface stack — same order as paint (not type bands). */}
        {surfaceStack.map((entry) => {
          if (entry.type === 'image') {
            if (snapshot.agentMode) {
              return null;
            }
            return (
              <ImageTransformChrome
                key={`chrome-${entry.id}`}
                workspace={workspace}
                images={[entry]}
                selection={snapshot.selection}
                interactive={chromeInteractive}
                peerDraftById={surfaceDraft?.draftById}
                onDraftChange={handleSurfaceDraftChange}
              />
            );
          }
          return (
            <FrameTransformChrome
              key={`chrome-${entry.id}`}
              workspace={workspace}
              frames={[entry]}
              selection={snapshot.selection}
              interactive={frameChromeInteractive}
              geometry="graph"
              peerDraftById={surfaceDraft?.draftById}
              onDraftChange={handleSurfaceDraftChange}
              getSnapCandidates={getSnapCandidates}
              onSnapGuidesChange={handleSnapGuidesChange}
            />
          );
        })}
        <CreateRectGesture
          active={snapshot.activeTool === 'createFrame'}
          onCommit={handleCreateFrameCommit}
          aspectRatio={framePrefs.ratio}
          defaultSize={{
            width: framePrefs.defaultWidth,
            height: framePrefs.defaultHeight,
          }}
          getSnapCandidates={getCreateSnapCandidates}
          onSnapGuidesChange={handleCreateSnapGuidesChange}
        />
        <GraphSnapGuides guides={snapGuides} color={snapGuideColor} />
      </div>
    </div>
  );
}

/**
 * Graph board on the shared ViewportShell: Frame cards + createFrame gesture.
 */
export function GraphHost({ workspace, canvasLive = true }: GraphHostProps) {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => subscribeGraphStores(workspace, onStoreChange),
    () => getGraphSnapshot(workspace),
    () => getGraphSnapshot(workspace),
  );
  const [surfaceDraft, setSurfaceDraft] =
    useState<SurfaceTransformDraft | null>(null);
  const [snapGuides, setSnapGuidesState] = useState<SnapGuideState>(
    emptySnapGuides(),
  );
  const [snapGuideColor, setSnapGuideColor] = useState('#000000');

  const setSnapGuides = useCallback(
    (guides: SnapGuideState, color: string | null) => {
      setSnapGuidesState(guides);
      if (color != null) {
        setSnapGuideColor(color);
      }
    },
    [],
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

  const { graphId } = snapshot;
  if (!graphId) {
    return null;
  }

  const sessionViewport = snapshot.sessionViewport;

  return (
    <div key={graphId} className="absolute inset-0 flex flex-col">
      <ViewportShell
        worldWidth={BOARD_WIDTH}
        worldHeight={BOARD_HEIGHT}
        infiniteCanvas
        showWorldBorder={false}
        initialCenterRect={{ x: 0, y: 0, width: 1024, height: 1024 }}
        initialViewport={
          isDefaultSessionViewport(sessionViewport)
            ? undefined
            : sessionToShellViewport(sessionViewport)
        }
        onViewportChange={handleViewportChange}
        onZoomChange={handleZoomChange}
        paneClassName="h-full w-full"
      >
        <div className="relative">
          <GraphBoard
            workspace={workspace}
            snapshot={snapshot}
            canvasLive={canvasLive}
            surfaceDraft={surfaceDraft}
            setSurfaceDraft={setSurfaceDraft}
            snapGuides={snapGuides}
            snapGuideColor={snapGuideColor}
            setSnapGuides={setSnapGuides}
          />
        </div>
      </ViewportShell>
    </div>
  );
}
