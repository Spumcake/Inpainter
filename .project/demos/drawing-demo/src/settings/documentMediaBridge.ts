/**
 * Tray Document media put/get bridge.
 * Bytes live under the OS data root (not Asset Library, not Indexer output).
 * See backend/docs/files-and-media.md.
 */

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { isTauri } from '../tauri-env';

export type DocumentMediaRecord = {
  mediaId: string;
  mime: string;
  path: string;
  size: number;
  filename?: string;
};

export async function ensureDocumentMediaDirs(
  indexerUrl: string,
  documentId: string,
): Promise<void> {
  if (!isTauri()) {
    throw new Error('Document media requires the Desktop tray (Tauri)');
  }
  await invoke('ensure_document_media_dirs', { indexerUrl, documentId });
}

export async function putDocumentMedia(args: {
  indexerUrl: string;
  documentId: string;
  bytesBase64: string;
  mime: string;
  filename?: string;
}): Promise<DocumentMediaRecord> {
  if (!isTauri()) {
    throw new Error('Document media requires the Desktop tray (Tauri)');
  }
  return invoke<DocumentMediaRecord>('put_document_media', {
    indexerUrl: args.indexerUrl,
    documentId: args.documentId,
    bytesBase64: args.bytesBase64,
    mime: args.mime,
    filename: args.filename,
  });
}

/** OS file path → Document media (Tauri drag-drop; not Asset Library). */
export async function putDocumentMediaFromPath(args: {
  indexerUrl: string;
  documentId: string;
  sourcePath: string;
}): Promise<DocumentMediaRecord> {
  if (!isTauri()) {
    throw new Error('Document media requires the Desktop tray (Tauri)');
  }
  return invoke<DocumentMediaRecord>('put_document_media_from_path', {
    indexerUrl: args.indexerUrl,
    documentId: args.documentId,
    sourcePath: args.sourcePath,
  });
}

export async function getDocumentMedia(args: {
  indexerUrl: string;
  documentId: string;
  mediaId: string;
}): Promise<DocumentMediaRecord> {
  if (!isTauri()) {
    throw new Error('Document media requires the Desktop tray (Tauri)');
  }
  return invoke<DocumentMediaRecord>('get_document_media', {
    indexerUrl: args.indexerUrl,
    documentId: args.documentId,
    mediaId: args.mediaId,
  });
}

/**
 * Resolve a webview-loadable URL for Document media bytes.
 * Durability remains `mediaId` — do not persist the returned src.
 */
export async function resolveDocumentMediaSrc(args: {
  indexerUrl: string;
  documentId: string;
  mediaId: string;
}): Promise<string> {
  const record = await getDocumentMedia(args);
  return convertFileSrc(record.path);
}
