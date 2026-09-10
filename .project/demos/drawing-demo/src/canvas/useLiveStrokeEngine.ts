import { useCallback, useRef } from 'react';
import { commitStroke } from '../authoring/sketch';
import type { CanvasId, LayerId, NodeId } from '../authoring/ids';
import { setInteractionBusy } from '../authoring/session';
import type { AuthoringWorkspace } from '../authoring/workspace';
import type { ActiveTool, SketchData } from '../authoring/types';
import type { CanvasPath } from './engine/types';
import type { ReactSketchCanvasRef } from './engine/react-sketch-canvas';
import {
  canvasPathToStrokeAttrs,
  canvasPathToStrokePoints,
} from './pathUtils';
import { resolvePaintStrokeCommitArgs } from './resolvePaintStrokeCommitArgs';
import {
  detectCompletedPath,
  isDrawingTargetAvailable,
  shouldCaptureStroke,
} from './strokeBridge';

type UseLiveStrokeEngineArgs = {
  workspace: AuthoringWorkspace;
  canvasId: CanvasId;
  sketch: SketchData;
  activeTool: ActiveTool;
  activeLayerId: LayerId | null;
  activePaletteId: string | null;
  activeSketchId: NodeId | null;
  /** Paint with no Sketch selected — create Sketch on first completed stroke. */
  createOnStroke: boolean;
  canvasLive: boolean;
  canvasRef: React.RefObject<ReactSketchCanvasRef | null>;
};

export function useLiveStrokeEngine({
  workspace,
  canvasId,
  sketch,
  activeTool,
  activeLayerId,
  activePaletteId,
  activeSketchId,
  createOnStroke,
  canvasLive,
  canvasRef,
}: UseLiveStrokeEngineArgs) {
  const previousPathCountRef = useRef(0);
  const suppressCommitRef = useRef(false);

  const targetReady =
    createOnStroke
      ? activeTool === 'paint'
      : activeSketchId != null && shouldCaptureStroke(activeTool);

  const canDraw =
    canvasLive &&
    targetReady &&
    shouldCaptureStroke(activeTool) &&
    isDrawingTargetAvailable(activeLayerId, sketch, activePaletteId);

  /**
   * Ignore onChange fired synchronously by programmatic clear/load.
   * Must not depend on requestAnimationFrame — backgrounded WebViews freeze
   * rAF, which left suppress latched and dropped the first stroke after refocus.
   */
  const runWithoutCommit = useCallback((fn: () => void) => {
    suppressCommitRef.current = true;
    try {
      fn();
    } finally {
      suppressCommitRef.current = false;
    }
  }, []);

  /** Load committed paths into the live engine for mask-erase preview. */
  const hydrateEnginePaths = useCallback(
    (paths: CanvasPath[]) => {
      // loadPaths updates state only — it does not call onChange.
      canvasRef.current?.loadPaths(paths);
      previousPathCountRef.current = paths.length;
    },
    [canvasRef],
  );

  const clearEnginePaths = useCallback(() => {
    runWithoutCommit(() => {
      canvasRef.current?.clearCanvas();
    });
    previousPathCountRef.current = 0;
  }, [canvasRef, runWithoutCommit]);

  const handleEngineChange = useCallback(
    (paths: CanvasPath[]) => {
      if (suppressCommitRef.current) {
        previousPathCountRef.current = paths.length;
        return;
      }

      const completed = detectCompletedPath(
        previousPathCountRef.current,
        paths,
        activeTool,
      );

      // Mid-stroke: defer remote Document patches until the gesture ends.
      if (!completed && paths.length > previousPathCountRef.current && canDraw) {
        setInteractionBusy(workspace.sessionStore, true);
      }

      previousPathCountRef.current = paths.length;
      if (!completed || !canDraw) {
        return;
      }

      setInteractionBusy(workspace.sessionStore, false);

      const commitArgs = resolvePaintStrokeCommitArgs({
        workspace,
        canvasId,
        sketch,
        activeLayerId,
        activePaletteId,
        activeSketchId,
        createOnStroke: createOnStroke && activeTool === 'paint',
      });
      if (!commitArgs) {
        return;
      }

      workspace.runner.dispatch(
        commitStroke({
          canvasId,
          layerId: commitArgs.layerId,
          sublayerId: commitArgs.sublayerId ?? undefined,
          points: canvasPathToStrokePoints(completed),
          attrs: canvasPathToStrokeAttrs(completed),
          paletteId: commitArgs.paletteId,
          sketchId: commitArgs.sketchId,
        }),
      );

      // Paint: clear ephemeral engine (committed layer shows the mark).
      // Erase: keep paths so the mask preview stays until sketch sync rehydrates.
      if (activeTool === 'paint') {
        runWithoutCommit(() => {
          canvasRef.current?.clearCanvas();
        });
        previousPathCountRef.current = 0;
      }
    },
    [
      activeSketchId,
      activeLayerId,
      activePaletteId,
      activeTool,
      canvasId,
      canvasRef,
      canDraw,
      createOnStroke,
      runWithoutCommit,
      sketch,
      workspace,
    ],
  );

  return {
    canDraw,
    handleEngineChange,
    hydrateEnginePaths,
    clearEnginePaths,
  };
}
