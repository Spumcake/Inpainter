import { useEffect, useRef } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { AuthoringWorkspace } from '../workspace/types';
import type { CanvasId } from '../ids';
import type { ActiveTool, Rect } from '../types';
import { putDocumentMediaFromPath } from '../../settings/documentMediaBridge';
import { isTauri } from '../../tauri-env';
import { commitCreatedImage } from './commitImageCreate';
import {
  canAcceptImageFileDrop,
  cappedImageSize,
  firstImagePath,
  readImageNaturalSizeFromSrc,
} from './importImageDrop';

export type ImageDropSurface =
  | { kind: 'graph' }
  | { kind: 'canvas'; canvasId: CanvasId };

export type UseImageFileDropArgs = {
  workspace: AuthoringWorkspace;
  surface: ImageDropSurface;
  activeTool: ActiveTool;
  chromeLive: boolean;
  /** Convert drop client coordinates to world space. */
  clientToWorld: (clientX: number, clientY: number) => { x: number; y: number };
};

/**
 * Select-only OS image file drop via Tauri native drag-drop events.
 * HTML5 dataTransfer.files is unreliable on WebKitGTK (Linux).
 * Paste is out of scope.
 */
export function useImageFileDrop(args: UseImageFileDropArgs): void {
  const busyRef = useRef(false);
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') {
          return;
        }
        const current = argsRef.current;
        if (
          !canAcceptImageFileDrop({
            activeTool: current.activeTool,
            chromeLive: current.chromeLive,
          })
        ) {
          console.info(
            '[ImageNode] drop ignored (Select + Live required)',
            current.activeTool,
            current.chromeLive,
          );
          return;
        }
        const sourcePath = firstImagePath(event.payload.paths);
        if (!sourcePath) {
          console.info(
            '[ImageNode] drop ignored (no image path)',
            event.payload.paths,
          );
          return;
        }
        if (busyRef.current) {
          return;
        }

        const scale = window.devicePixelRatio || 1;
        const clientX = event.payload.position.x / scale;
        const clientY = event.payload.position.y / scale;
        const world = current.clientToWorld(clientX, clientY);

        void (async () => {
          busyRef.current = true;
          try {
            const doc = current.workspace.documentStore.getState();
            const indexerUrl = doc.indexerUrl?.trim();
            if (!indexerUrl) {
              console.error(
                '[ImageNode] drop import failed: document has no indexerUrl',
              );
              return;
            }

            const record = await putDocumentMediaFromPath({
              indexerUrl,
              documentId: String(doc.documentId),
              sourcePath,
            });

            const natural = await readImageNaturalSizeFromSrc(
              convertFileSrc(record.path),
            );
            const size = cappedImageSize(natural.width, natural.height);
            const rect: Rect = {
              x: world.x,
              y: world.y,
              width: size.width,
              height: size.height,
            };

            const placement =
              current.surface.kind === 'graph'
                ? ({ kind: 'graph', graph: rect } as const)
                : ({
                    kind: 'canvas',
                    canvasId: current.surface.canvasId,
                    canvas: rect,
                  } as const);

            commitCreatedImage(current.workspace, {
              mediaId: record.mediaId,
              placement,
            });
          } catch (error) {
            console.error('[ImageNode] drop import failed', error);
          } finally {
            busyRef.current = false;
          }
        })();
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((error) => {
        console.error('[ImageNode] drag-drop listen failed', error);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
