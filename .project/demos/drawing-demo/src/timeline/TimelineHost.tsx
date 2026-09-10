import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  framesForCanvas,
  framesForGraph,
  getCanvasTitle,
  getDocumentTitle,
  sketchesForCanvas,
} from '../authoring/document';
import type { AuthoringWorkspace } from '../authoring/workspace';
import { TimelineShell, type TimelineDrawing, type TimelineLayer } from './TimelineShell';

const PLACEHOLDER_TOTAL_FRAMES = 120;

type TimelineHostProps = {
  workspace: AuthoringWorkspace;
};

type TimelineSnapshot = {
  graphId: string | null;
  canvasId: string | null;
  documentTitle: string;
  canvasTitle: string;
  drawingCount: number;
  drawings: TimelineDrawing[];
};

const snapshotCache = new WeakMap<AuthoringWorkspace, TimelineSnapshot>();

function subscribeStores(
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

function getSnapshot(workspace: AuthoringWorkspace): TimelineSnapshot {
  const documentState = workspace.documentStore.getState();
  const sessionState = workspace.sessionStore.getState();
  const { graphId, canvasId } = sessionState.viewFocus;

  const frames = canvasId
    ? framesForCanvas(documentState, canvasId)
    : graphId
      ? framesForGraph(documentState, graphId)
      : [];
  const sketches = canvasId ? sketchesForCanvas(documentState, canvasId) : [];

  const drawings: TimelineDrawing[] = [];
  if (frames.length > 0) {
    frames.forEach((frame, index) => {
      drawings.push({
        id: frame.id,
        name: frame.name,
        frameIndex: index + 1,
        isKey: index === 0,
      });
    });
  } else {
    sketches.forEach((sketch, index) => {
      drawings.push({
        id: sketch.id,
        name: sketch.name,
        frameIndex: index + 1,
        isKey: index === 0,
      });
    });
  }

  const next: TimelineSnapshot = {
    graphId,
    canvasId,
    documentTitle: getDocumentTitle(documentState),
    canvasTitle: getCanvasTitle(documentState, canvasId),
    drawingCount: drawings.length,
    drawings,
  };

  const cached = snapshotCache.get(workspace);
  if (
    cached &&
    cached.graphId === next.graphId &&
    cached.canvasId === next.canvasId &&
    cached.documentTitle === next.documentTitle &&
    cached.canvasTitle === next.canvasTitle &&
    cached.drawingCount === next.drawingCount &&
    cached.drawings.length === next.drawings.length &&
    cached.drawings.every(
      (drawing, index) =>
        drawing.id === next.drawings[index]?.id &&
        drawing.name === next.drawings[index]?.name &&
        drawing.frameIndex === next.drawings[index]?.frameIndex,
    )
  ) {
    return cached;
  }

  snapshotCache.set(workspace, next);
  return next;
}

export function TimelineHost({ workspace }: TimelineHostProps) {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => subscribeStores(workspace, onStoreChange),
    () => getSnapshot(workspace),
    () => getSnapshot(workspace),
  );
  const [activeFrame, setActiveFrame] = useState(1);

  const drawings = snapshot.drawings;

  const layers = useMemo<TimelineLayer[]>(
    () => [
      {
        id: 'drawings',
        kind: 'drawings',
        name: snapshot.canvasId ? 'Rough animation' : 'Frames',
        locked: false,
        selected: true,
      },
      {
        id: 'background',
        kind: 'background',
        name: 'Background',
        locked: true,
        selected: false,
      },
    ],
    [snapshot.canvasId],
  );

  const handleSelectFrame = useCallback((frame: number) => {
    setActiveFrame(frame);
  }, []);

  return (
    <TimelineShell
      activeFrame={activeFrame}
      totalFrames={PLACEHOLDER_TOTAL_FRAMES}
      documentTitle={snapshot.documentTitle}
      canvasTitle={snapshot.canvasTitle}
      drawings={drawings}
      layers={layers}
      onSelectFrame={handleSelectFrame}
    />
  );
}
