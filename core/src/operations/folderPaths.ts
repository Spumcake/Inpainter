import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { CoreError } from "../errors.ts";

export function normalizeRelative(relative: string): string {
  return relative.trim().replace(/\\/g, "/").replace(/\/{2,}/gu, "/");
}

export function resolveFolderRelative(folderRoot: string, relative: string): string {
  const normalized = normalizeRelative(relative);
  if (!normalized) {
    throw new CoreError("Path is not folder-relative.");
  }
  if (isAbsolute(normalized) || isAbsolute(relative.trim()) || normalized.split("/").includes("..")) {
    throw new CoreError(`Path is not folder-relative: ${relative}`);
  }
  const root = resolve(folderRoot);
  const resolved = resolve(root, ...normalized.split("/").filter(Boolean));
  if (!isResolvedInside(root, resolved)) {
    throw new CoreError(`Path escapes the production folder: ${relative}`);
  }
  return resolved;
}

export function isLogicalInsideFolder(folderRoot: string, filePath: string): boolean {
  const root = resolve(folderRoot);
  const file = resolve(filePath);
  return isResolvedInside(root, file);
}

export function logicalRelative(folderRoot: string, filePath: string): string {
  const root = resolve(folderRoot);
  const file = resolve(filePath);
  if (!isResolvedInside(root, file) || file === root) {
    throw new CoreError(`Path is not inside the production folder: ${filePath}`);
  }
  return file.slice(root.length + 1).replace(/\\/g, "/");
}

export function assertRealpathInsideFolder(folderRoot: string, filePath: string): string {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new CoreError(`Location does not exist or is not a file: ${filePath}`);
  }
  let fileReal: string;
  let rootReal: string;
  try {
    fileReal = realpathSync(filePath);
    rootReal = realpathSync(folderRoot);
  } catch {
    throw new CoreError(`Location does not exist or is not a file: ${filePath}`);
  }
  if (!isResolvedInside(rootReal, fileReal)) {
    throw new CoreError(`Path escapes the production folder: ${filePath}`);
  }
  return fileReal;
}

export function assertCreatableInside(folderRoot: string, destination: string): void {
  const root = resolve(folderRoot);
  let probe = dirname(resolve(destination));
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) {
      break;
    }
    probe = parent;
  }
  if (!existsSync(probe)) {
    throw new CoreError(`Path escapes the production folder: ${destination}`);
  }
  let probeReal: string;
  let rootReal: string;
  try {
    probeReal = realpathSync(probe);
    rootReal = existsSync(folderRoot) ? realpathSync(folderRoot) : root;
  } catch {
    throw new CoreError(`Path escapes the production folder: ${destination}`);
  }
  if (!isResolvedInside(rootReal, probeReal) && probeReal !== rootReal) {
    throw new CoreError(`Path escapes the production folder: ${destination}`);
  }
  const tail = resolve(destination).slice(resolve(probe).length).replace(/^[/\\]/u, "");
  const projected = resolve(probeReal, ...tail.split(/[/\\]/u).filter(Boolean));
  if (!isResolvedInside(rootReal, projected)) {
    throw new CoreError(`Path escapes the production folder: ${destination}`);
  }
}

export function isResolvedInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}
