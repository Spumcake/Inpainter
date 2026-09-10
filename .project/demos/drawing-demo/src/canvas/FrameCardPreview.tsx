import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  getGenerationJobs,
  isGenerationJobBusy,
  subscribeGenerationJobs,
} from '../agent/generationJobs';
import { frameCardRect, imageRect } from '../authoring/document';
import {
  comparePeerStackOrder,
  frameResultView,
  strokeBelongsToSketch,
} from '../authoring/nodes';
import type {
  FrameNode,
  ImageNode,
  Rect,
  SketchData,
  SketchNode,
  Stroke,
} from '../authoring/types';
import type { AuthoringWorkspace } from '../authoring/workspace';
import { resolveDocumentMediaSrc } from '../settings/documentMediaBridge';
import { buildBrushSlotIndexMap } from '../settings/palette/sharedSlots';
import { CommittedPathsLayer } from './CommittedPathsLayer';
import { ImageNodeBitmaps } from './ImageNodeBitmaps';
import type { SurfaceTransformDraft } from './transform';
import {
  INFINITE_CANVAS_ORIGIN,
  INFINITE_CANVAS_SIZE,
} from './viewport';

/** Match FrameTransformChrome corner radius. */
const CARD_CORNER_RADIUS = 6;
const CARD_FILL = '#ffffff';
const BUSY_FILL = '#000000';

/** Same infinite viewBox as CanvasHost — required for erase mask userSpaceOnUse. */
const infiniteViewBox = `${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_ORIGIN} ${INFINITE_CANVAS_SIZE} ${INFINITE_CANVAS_SIZE}`;

export type FrameCardPreviewProps = {
  workspace: AuthoringWorkspace;
  frames: FrameNode[];
  /** SketchData for each Frame canvas (reference equality drives updates). */
  sketchesByCanvasId: ReadonlyMap<string, SketchData | null>;
  /** Sketch Nodes per canvas, stackOrder ascending. */
  sketchNodesByCanvasId: ReadonlyMap<string, readonly SketchNode[]>;
  /** Canvas-placed Image Nodes per canvas (for input crop). */
  imagesByCanvasId: ReadonlyMap<string, readonly ImageNode[]>;
  /** Live Graph transform draft so the card tracks chrome while dragging. */
  transformDraft?: SurfaceTransformDraft | null;
};

/**
 * Position/scale the infinite draw plane so `crop` fills a card of `cardSize`.
 * Keeps SVG user space identical to Canvas (erase masks stay aligned).
 */
export function frameCropPlaneStyle(
  crop: Rect,
  cardSize: { width: number; height: number },
): CSSProperties {
  const cropW = Math.max(1, crop.width);
  const cropH = Math.max(1, crop.height);
  const scaleX = Math.max(1, cardSize.width) / cropW;
  const scaleY = Math.max(1, cardSize.height) / cropH;
  const left = -(crop.x - INFINITE_CANVAS_ORIGIN) * scaleX;
  const top = -(crop.y - INFINITE_CANVAS_ORIGIN) * scaleY;
  const style: CSSProperties = {
    position: 'absolute',
    left,
    top,
    width: INFINITE_CANVAS_SIZE,
    height: INFINITE_CANVAS_SIZE,
    transformOrigin: '0 0',
  };
  if (scaleX !== 1 || scaleY !== 1) {
    style.transform = `scale(${scaleX}, ${scaleY})`;
  }
  return style;
}

function busyFrameIdsFromJobs(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const job of getGenerationJobs()) {
    if (job.nodeId && isGenerationJobBusy(job.phase)) {
      ids.add(job.nodeId);
    }
  }
  return ids;
}

/**
 * Input crop: Canvas surface stack (Images + Sketches) in stackOrder.
 * Hides this Frame’s result Image while showing input (matches CanvasHost).
 */
function FrameCropSurfaceLayers({
  workspace,
  frameId,
  resultImageId,
  sketch,
  sketchNodes,
  images,
}: {
  workspace: AuthoringWorkspace;
  frameId: FrameNode['id'];
  resultImageId: FrameNode['resultImageId'];
  sketch: SketchData | null;
  sketchNodes: readonly SketchNode[];
  images: readonly ImageNode[];
}) {
  const soleSketchId =
    sketchNodes.length === 1 ? (sketchNodes[0]?.id ?? null) : null;
  const visibleImages =
    resultImageId != null
      ? images.filter((image) => image.id !== resultImageId)
      : images;
  const surfaceStack = [...visibleImages, ...sketchNodes].sort(
    comparePeerStackOrder,
  );

  return (
    <>
      {surfaceStack.map((entry) => {
        if (entry.type === 'image') {
          return (
            <ImageNodeBitmaps
              key={entry.id}
              workspace={workspace}
              images={[entry]}
            />
          );
        }
        if (!sketch || !entry.visible) {
          return null;
        }
        const belongs = (path: Stroke) =>
          strokeBelongsToSketch(path, entry.id, soleSketchId);
        return (
          <CommittedPathsLayer
            key={entry.id}
            sketch={sketch}
            viewBox={infiniteViewBox}
            slotIndexByBrushId={buildBrushSlotIndexMap(entry.palettes ?? [])}
            pathFilter={belongs}
            idSuffix={`-fc-${frameId}-s-${entry.id}`}
          />
        );
      })}
    </>
  );
}

/**
 * Graph Frame card fill: always a crop viewport into the Frame’s Canvas.
 * Input view → Canvas surface stack (Images + Sketches); output view → result Image.
 * Busy jobs show a black window with a centered activity spinner.
 * Non-interactive; FrameTransformChrome stacks above for Select hits.
 */
export function FrameCardPreview({
  workspace,
  frames,
  sketchesByCanvasId,
  sketchNodesByCanvasId,
  imagesByCanvasId,
  transformDraft = null,
}: FrameCardPreviewProps) {
  useSyncExternalStore(
    subscribeGenerationJobs,
    getGenerationJobs,
    getGenerationJobs,
  );
  const documentState = useSyncExternalStore(
    (onStoreChange) => workspace.documentStore.subscribe(onStoreChange),
    () => workspace.documentStore.getState(),
    () => workspace.documentStore.getState(),
  );
  const busyFrameIds = busyFrameIdsFromJobs();
  /** Hide broken generation URLs so live crop strokes remain visible. */
  const [failedWindowUrls, setFailedWindowUrls] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [failedMediaIds, setFailedMediaIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [srcByMediaId, setSrcByMediaId] = useState<Record<string, string>>({});

  const resultMediaIdsKey = useMemo(() => {
    const ids: string[] = [];
    for (const frame of frames) {
      if (frameResultView(frame) !== 'output' || !frame.resultImageId) continue;
      const image = documentState.nodes[frame.resultImageId];
      if (image?.type === 'image') {
        ids.push(image.mediaId);
      }
    }
    return [...new Set(ids)].sort().join(',');
  }, [documentState.nodes, frames]);

  useEffect(() => {
    const indexerUrl = documentState.indexerUrl?.trim();
    if (!indexerUrl || resultMediaIdsKey === '') {
      return;
    }
    const documentId = String(documentState.documentId);
    const mediaIds = resultMediaIdsKey.split(',').filter(Boolean);
    let cancelled = false;

    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        mediaIds.map(async (mediaId) => {
          try {
            next[mediaId] = await resolveDocumentMediaSrc({
              indexerUrl,
              documentId,
              mediaId,
            });
          } catch (error) {
            console.error('[FrameCard] result media resolve failed', mediaId, error);
          }
        }),
      );
      if (!cancelled) {
        setSrcByMediaId((prev) => ({ ...prev, ...next }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentState.documentId, documentState.indexerUrl, resultMediaIdsKey]);

  if (frames.length === 0) {
    return null;
  }

  return (
    <>
      {frames.map((frame) => {
        if (!frame.visible) return null;
        const drafting =
          transformDraft?.draftById.get(String(frame.id)) ?? null;
        const card = drafting ?? frameCardRect(frame);
        const cropView: Rect = drafting
          ? {
              x: frame.crop.x,
              y: frame.crop.y,
              width: drafting.width,
              height: drafting.height,
            }
          : frame.crop;
        const sketch = sketchesByCanvasId.get(frame.canvasId) ?? null;
        const sketchNodes = sketchNodesByCanvasId.get(frame.canvasId) ?? [];
        const canvasImages = imagesByCanvasId.get(frame.canvasId) ?? [];
        const busy = busyFrameIds.has(frame.id);
        const planeStyle = frameCropPlaneStyle(cropView, card);

        // CSS left/top are relative to the draw plane (origin at -EXTENT).
        const style: CSSProperties = {
          left: card.x - INFINITE_CANVAS_ORIGIN,
          top: card.y - INFINITE_CANVAS_ORIGIN,
          width: card.width,
          height: card.height,
          borderRadius: CARD_CORNER_RADIUS,
          backgroundColor: busy ? BUSY_FILL : CARD_FILL,
          overflow: 'hidden',
          pointerEvents: 'none',
        };

        const resultImageNode =
          frameResultView(frame) === 'output' && frame.resultImageId
            ? documentState.nodes[frame.resultImageId]
            : undefined;
        const resultImage: ImageNode | null =
          resultImageNode?.type === 'image' ? resultImageNode : null;
        const resultMediaId = resultImage?.mediaId ?? null;
        const resultSrc =
          resultMediaId != null && !failedMediaIds.has(resultMediaId)
            ? srcByMediaId[resultMediaId]
            : undefined;
        const showResultOnPlane = Boolean(resultImage && resultSrc);
        const resultWorldRect = resultImage ? imageRect(resultImage) : null;
        const showInputCrop =
          !showResultOnPlane &&
          (sketch != null || canvasImages.length > 0);

        const windowUrl = frame.frameWindowUrl?.trim() || null;
        const showWindowUrl =
          frameResultView(frame) === 'output' &&
          !showResultOnPlane &&
          !resultImage &&
          windowUrl != null &&
          !failedWindowUrls.has(windowUrl);

        return (
          <div
            key={frame.id}
            className="absolute"
            style={style}
            aria-hidden
          >
            {busy ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="agent-activity-spinner"
                  style={{
                    display: 'block',
                    width: 14,
                    height: 14,
                    borderRadius: 9999,
                    border: '2px solid rgba(255,255,255,0.25)',
                    borderTopColor: '#ffffff',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ) : (
              <>
                <div style={planeStyle}>
                  {showInputCrop ? (
                    <FrameCropSurfaceLayers
                      workspace={workspace}
                      frameId={frame.id}
                      resultImageId={
                        frameResultView(frame) === 'input'
                          ? frame.resultImageId
                          : undefined
                      }
                      sketch={sketch}
                      sketchNodes={sketchNodes}
                      images={canvasImages}
                    />
                  ) : null}
                  {showResultOnPlane &&
                  resultSrc &&
                  resultMediaId &&
                  resultWorldRect ? (
                    <img
                      src={resultSrc}
                      alt=""
                      draggable={false}
                      className="absolute max-w-none"
                      style={{
                        left: resultWorldRect.x - INFINITE_CANVAS_ORIGIN,
                        top: resultWorldRect.y - INFINITE_CANVAS_ORIGIN,
                        width: resultWorldRect.width,
                        height: resultWorldRect.height,
                        objectFit: 'fill',
                        display: 'block',
                      }}
                      onError={() => {
                        setFailedMediaIds((prev) => {
                          if (prev.has(resultMediaId)) return prev;
                          const next = new Set(prev);
                          next.add(resultMediaId);
                          return next;
                        });
                      }}
                    />
                  ) : null}
                </div>
                {showWindowUrl ? (
                  <img
                    src={windowUrl}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    onError={() => {
                      setFailedWindowUrls((prev) => {
                        if (prev.has(windowUrl)) return prev;
                        const next = new Set(prev);
                        next.add(windowUrl);
                        return next;
                      });
                    }}
                  />
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
