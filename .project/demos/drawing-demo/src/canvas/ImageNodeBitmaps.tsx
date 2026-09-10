import { useEffect, useMemo, useState } from 'react';
import type { AuthoringWorkspace } from '../authoring/workspace';
import type { ImageNode, Rect } from '../authoring/types';
import { imageRect } from '../authoring/document';
import { resolveDocumentMediaSrc } from '../settings/documentMediaBridge';
import { INFINITE_CANVAS_ORIGIN } from './viewport';

type ImageNodeBitmapsProps = {
  workspace: AuthoringWorkspace;
  images: ImageNode[];
  /** Live transform draft for the sole selected Image (optional). */
  draftById?: ReadonlyMap<string, Rect> | null;
};

/**
 * World-space bitmap projection for Image Nodes.
 * Src resolved from Document media via tray; not Asset Library.
 */
export function ImageNodeBitmaps({
  workspace,
  images,
  draftById,
}: ImageNodeBitmapsProps) {
  const [srcByMediaId, setSrcByMediaId] = useState<Record<string, string>>({});

  const mediaIdsKey = useMemo(
    () =>
      images
        .filter((n) => n.visible)
        .map((n) => n.mediaId)
        .sort()
        .join(','),
    [images],
  );

  useEffect(() => {
    const doc = workspace.documentStore.getState();
    const indexerUrl = doc.indexerUrl?.trim();
    if (!indexerUrl || mediaIdsKey === '') {
      return;
    }
    const documentId = String(doc.documentId);
    const mediaIds = mediaIdsKey.split(',').filter(Boolean);
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
            console.error('[ImageNode] media resolve failed', mediaId, error);
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
  }, [mediaIdsKey, workspace.documentStore]);

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      {images.map((node) => {
        if (!node.visible) return null;
        const src = srcByMediaId[node.mediaId];
        if (!src) return null;
        const rect = draftById?.get(node.id) ?? imageRect(node);
        return (
          <img
            key={node.id}
            src={src}
            alt=""
            draggable={false}
            className="absolute max-w-none"
            style={{
              left: rect.x - INFINITE_CANVAS_ORIGIN,
              top: rect.y - INFINITE_CANVAS_ORIGIN,
              width: rect.width,
              height: rect.height,
              objectFit: 'fill',
            }}
          />
        );
      })}
    </div>
  );
}
