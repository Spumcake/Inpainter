import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { CoreError } from "../errors.ts";

export const FOLDER_MANIFEST_RELATIVE = join(".inpainter", "folder.json");
export const DEFAULT_DOCUMENT_RELATIVE = ".inpainter/production/project.oreel";
export const FOLDER_SCHEMA_VERSION = 1 as const;

export type FolderManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  documentId: string;
  document: string;
};

export function folderManifestPath(folder: string): string {
  return join(folder, FOLDER_MANIFEST_RELATIVE);
}

export function folderManifestToJson(manifest: FolderManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function parseFolderManifestJson(json: string, path: string): FolderManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse error";
    throw new CoreError(`${path} is not valid JSON: ${message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CoreError(`${path} is not a valid production-folder manifest`);
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== FOLDER_SCHEMA_VERSION) {
    throw new CoreError(`${path} is not a valid production-folder manifest`);
  }
  return {
    schemaVersion: 1,
    id: requiredField(record, "id", path),
    name: requiredField(record, "name", path),
    documentId: requiredField(record, "documentId", path),
    document: requiredField(record, "document", path),
  };
}

export function readFolderManifest(folder: string): FolderManifest | null {
  const path = folderManifestPath(folder);
  if (!existsSync(path)) {
    return null;
  }
  return parseFolderManifestJson(readFileSync(path, "utf8"), path);
}

export function writeFolderManifest(folder: string, manifest: FolderManifest): void {
  const path = folderManifestPath(folder);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, folderManifestToJson(manifest));
  try {
    renameSync(temporary, path);
  } catch (error) {
    throw new CoreError(`failed to write ${path}: ${error}`);
  }
}

function requiredField(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new CoreError(`${path} is missing required field ${key}`);
  }
  return value.trim();
}
