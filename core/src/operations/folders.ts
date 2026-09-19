/**
 * First-slice production-folder identity:
 * - Moved folders keep the stored path. List reports available:false. There is
 *   no search-by-id; reopen at a new path is an explicit attach.
 * - Copied folders keep folder.json's id. Attaching a copy into a workspace
 *   that already has that id is refused. A second workspace may attach the copy;
 *   that is membership, not an identity merge.
 * - The same folder may be attached to two workspaces. Each stores membership;
 *   the folder owns the id and document.
 * - Attach of a missing path fails with a CoreError naming that path.
 */
import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { CoreError } from "../errors.ts";
import type { DocumentSnapshot } from "../production/types.ts";
import { readAttachments, writeAttachments } from "./attachments.ts";
import { createDocument, openDocument } from "./documents.ts";
import {
  DEFAULT_DOCUMENT_RELATIVE,
  folderManifestPath,
  readFolderManifest,
  writeFolderManifest,
  type FolderManifest,
} from "./folderManifest.ts";
import { resolveFolderRelative } from "./folderPaths.ts";
import { ensureSessionIndex } from "./sessionIndex.ts";
import { requireWorkspace } from "./workspaces.ts";

export type AttachFailAfter = "document" | "manifest";

export type FolderRecord = {
  id: string;
  name: string;
  path: string;
  documentId: string;
  document: string;
  available: boolean;
};

export type AttachedFolder = {
  workspaceId: string;
  folder: FolderRecord;
  document: DocumentSnapshot;
};

export function attachFolder(input: {
  workspaceId: string;
  path: string;
  failAfter?: AttachFailAfter;
}): AttachedFolder {
  const workspace = requireWorkspace(input.workspaceId);
  const selected = resolve(input.path.trim());
  if (!existsSync(selected) || !statSync(selected).isDirectory()) {
    throw new CoreError(`Location does not exist or is not a folder: ${selected}`);
  }
  const canonical = realpathSync(selected);
  const attachments = readAttachments(workspace.path);
  if (attachments.folders.some((folder) => samePath(folder.path, canonical))) {
    throw new CoreError(`This folder is already attached: ${canonical}`);
  }

  const existing = readFolderManifest(canonical);
  if (existing && attachments.folders.some((folder) => folder.id === existing.id)) {
    throw new CoreError(`A folder with that identity is already attached: ${existing.id}`);
  }

  const relative = existing?.document ?? DEFAULT_DOCUMENT_RELATIVE;
  const documentPath = resolveFolderRelative(canonical, relative);
  const document = existsSync(documentPath)
    ? openDocument({ path: documentPath })
    : createDocument({ path: documentPath, name: existing?.name ?? folderName(canonical) });
  if (existing && existing.documentId !== document.id) {
    throw new CoreError(
      `${folderManifestPath(canonical)} documentId does not match ${documentPath}`,
    );
  }
  if (input.failAfter === "document") {
    throw new CoreError("injected failure after document");
  }

  const manifest: FolderManifest = existing ?? {
    schemaVersion: 1,
    id: randomUUID(),
    name: folderName(canonical),
    documentId: document.id,
    document: relative,
  };
  if (!existing) {
    writeFolderManifest(canonical, manifest);
  }
  if (attachments.folders.some((folder) => folder.id === manifest.id)) {
    throw new CoreError(`A folder with that identity is already attached: ${manifest.id}`);
  }
  if (input.failAfter === "manifest") {
    throw new CoreError("injected failure after manifest");
  }

  ensureSessionIndex(canonical);
  attachments.folders.push({ id: manifest.id, path: canonical });
  writeAttachments(workspace.path, attachments);
  return {
    workspaceId: workspace.id,
    folder: toRecord(manifest, canonical, true),
    document,
  };
}

export function listFolders(input: { workspaceId: string }): { folders: FolderRecord[] } {
  const workspace = requireWorkspace(input.workspaceId);
  const attachments = readAttachments(workspace.path);
  return {
    folders: attachments.folders.map((entry) => listedFolder(entry)),
  };
}

export function detachFolder(input: { workspaceId: string; id: string }): { detached: true; id: string } {
  const workspace = requireWorkspace(input.workspaceId);
  const id = input.id.trim();
  if (!id) {
    throw new CoreError("Folder id is required.");
  }
  const attachments = readAttachments(workspace.path);
  const next = attachments.folders.filter((folder) => folder.id !== id);
  if (next.length === attachments.folders.length) {
    throw new CoreError(`That folder is not attached: ${id}`);
  }
  writeAttachments(workspace.path, { ...attachments, folders: next });
  return { detached: true, id };
}

export function openFolderDocument(input: {
  workspaceId: string;
  folderId: string;
}): DocumentSnapshot {
  const folder = requireAttachedFolder(input);
  return openDocument({ path: resolveFolderRelative(folder.path, folder.manifest.document) });
}

export type AttachedFolderContext = {
  workspaceId: string;
  folderId: string;
  path: string;
  manifest: FolderManifest;
};

export function requireAttachedFolder(input: {
  workspaceId: string;
  folderId: string;
}): AttachedFolderContext {
  const workspace = requireWorkspace(input.workspaceId);
  const folderId = input.folderId.trim();
  if (!folderId) {
    throw new CoreError("Folder id is required.");
  }
  const attachments = readAttachments(workspace.path);
  const entry = attachments.folders.find((folder) => folder.id === folderId);
  if (!entry) {
    throw new CoreError(`That folder is not attached: ${folderId}`);
  }
  if (!existsSync(entry.path) || !statSync(entry.path).isDirectory()) {
    throw new CoreError(`Location does not exist or is not a folder: ${entry.path}`);
  }
  const manifest = readFolderManifest(entry.path);
  if (!manifest) {
    throw new CoreError(`Production-folder manifest is missing: ${folderManifestPath(entry.path)}`);
  }
  if (manifest.id !== folderId) {
    throw new CoreError(
      `${folderManifestPath(entry.path)} identity ${manifest.id} does not match attachment ${folderId}`,
    );
  }
  return {
    workspaceId: workspace.id,
    folderId,
    path: entry.path,
    manifest,
  };
}

function listedFolder(entry: { id: string; path: string }): FolderRecord {
  if (!existsSync(entry.path) || !statSync(entry.path).isDirectory()) {
    return {
      id: entry.id,
      name: "",
      path: entry.path,
      documentId: "",
      document: "",
      available: false,
    };
  }
  const manifest = readFolderManifest(entry.path);
  if (!manifest) {
    throw new CoreError(`Production-folder manifest is missing: ${folderManifestPath(entry.path)}`);
  }
  if (manifest.id !== entry.id) {
    throw new CoreError(
      `${folderManifestPath(entry.path)} identity ${manifest.id} does not match attachment ${entry.id}`,
    );
  }
  return toRecord(manifest, entry.path, true);
}

function toRecord(manifest: FolderManifest, path: string, available: boolean): FolderRecord {
  return {
    id: manifest.id,
    name: manifest.name,
    path,
    documentId: manifest.documentId,
    document: manifest.document,
    available,
  };
}

function folderName(folder: string): string {
  return basename(folder) || "Untitled";
}

function samePath(stored: string, candidate: string): boolean {
  try {
    return realpathSync(stored) === realpathSync(candidate);
  } catch {
    return resolve(stored) === resolve(candidate);
  }
}
