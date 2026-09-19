/**
 * First-slice asset locators:
 * - relativePath is posix and folder-root-relative (e.g. Images/accent.png).
 * - Locators must not be absolute, contain `..`, or start with `.inpainter/`.
 * - After realpath, the file must remain inside the production folder.
 *   A symlink that points outside is refused; a symlink that stays inside is
 *   stored as the logical relative path.
 * - Files already inside the folder are referenced, never copied or moved.
 * - Files outside the folder are copied only when copyTo is supplied.
 */
import { copyFileSync, closeSync, existsSync, mkdirSync, openSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { v4 as uuidv4 } from "uuid";

import { CoreError } from "../errors.ts";
import { cloneProject } from "../production/freeze.ts";
import type { AssetIndex } from "../production/types.ts";
import { inferAssetType } from "./assetHints.ts";
import { saveDocument } from "./documents.ts";
import {
  assertCreatableInside,
  assertRealpathInsideFolder,
  isLogicalInsideFolder,
  logicalRelative,
  normalizeRelative,
  resolveFolderRelative,
} from "./folderPaths.ts";
import { openFolderDocument, requireAttachedFolder } from "./folders.ts";

export type AssetRecord = {
  mediaId: string;
  relativePath: string;
  path: string;
  byteLength: number;
};

export function registerAsset(input: {
  workspaceId: string;
  folderId: string;
  path: string;
  copyTo?: string;
}): AssetRecord {
  const folder = requireAttachedFolder(input);
  const source = resolve(input.path.trim());
  if (!existsSync(source) || !statSync(source).isFile()) {
    throw new CoreError(`Location does not exist or is not a file: ${source}`);
  }

  const relativePath = isLogicalInsideFolder(folder.path, source)
    ? relativeFromInside(folder.path, source)
    : copyExternalIn(folder.path, source, input.copyTo);

  const existing = findMediaId(openFolderDocument(input).assets, relativePath);
  if (existing) {
    return resolveAsset({ ...input, mediaId: existing });
  }

  const snapshot = openFolderDocument(input);
  const mediaId = uuidv4();
  const name = basename(relativePath);
  const project = cloneProject(snapshot.project);
  project.modifiedAt = Date.now();
  project.mediaLibrary = {
    ...project.mediaLibrary,
    items: [
      ...project.mediaLibrary.items,
      {
        id: mediaId,
        name,
        type: inferAssetType(name),
        fileName: name,
      },
    ],
  };
  const assets: AssetIndex = {
    schemaVersion: 1,
    items: { ...snapshot.assets.items, [mediaId]: { relativePath } },
  };
  saveDocument({
    path: snapshot.path,
    payload: { project, assets },
    expectedRevision: snapshot.revision,
  });
  return resolveAsset({ ...input, mediaId });
}

export function resolveAsset(input: {
  workspaceId: string;
  folderId: string;
  mediaId: string;
}): AssetRecord {
  const folder = requireAttachedFolder(input);
  const mediaId = input.mediaId.trim();
  if (!mediaId) {
    throw new CoreError("Asset id is required.");
  }
  const snapshot = openFolderDocument(input);
  const entry = snapshot.assets.items[mediaId];
  if (!entry) {
    throw new CoreError(`Asset not found: ${mediaId}`);
  }
  const expected = resolveFolderRelative(folder.path, entry.relativePath);
  if (!existsSync(expected) || !statSync(expected).isFile()) {
    throw new CoreError(`Asset ${mediaId} is missing: ${expected}`);
  }
  assertRealpathInsideFolder(folder.path, expected);
  return {
    mediaId,
    relativePath: entry.relativePath,
    path: expected,
    byteLength: statSync(expected).size,
  };
}

function relativeFromInside(folderRoot: string, source: string): string {
  const relativePath = logicalRelative(folderRoot, source);
  assertVisibleLocator(relativePath);
  assertRealpathInsideFolder(folderRoot, source);
  return relativePath;
}

function copyExternalIn(folderRoot: string, source: string, copyTo: string | undefined): string {
  if (!copyTo?.trim()) {
    throw new CoreError(`File is outside the production folder and copyTo is required: ${source}`);
  }
  const relativePath = normalizeRelative(copyTo);
  assertVisibleLocator(relativePath);
  const destination = resolveFolderRelative(folderRoot, relativePath);
  assertCreatableInside(folderRoot, destination);
  if (existsSync(destination)) {
    throw new CoreError(`Asset destination already exists: ${destination}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  assertCreatableInside(folderRoot, destination);
  const fd = openSync(destination, "wx");
  closeSync(fd);
  copyFileSync(source, destination);
  assertRealpathInsideFolder(folderRoot, destination);
  return relativePath;
}

function assertVisibleLocator(relativePath: string): void {
  if (relativePath === ".inpainter" || relativePath.startsWith(".inpainter/")) {
    throw new CoreError(`Asset locator must not be under .inpainter/: ${relativePath}`);
  }
  if (isAbsoluteLike(relativePath) || relativePath.split("/").includes("..")) {
    throw new CoreError(`Path is not folder-relative: ${relativePath}`);
  }
}

function isAbsoluteLike(relativePath: string): boolean {
  return relativePath.startsWith("/") || /^[A-Za-z]:/u.test(relativePath);
}

function findMediaId(assets: AssetIndex, relativePath: string): string | undefined {
  for (const [mediaId, entry] of Object.entries(assets.items)) {
    if (entry.relativePath === relativePath) {
      return mediaId;
    }
  }
  return undefined;
}
