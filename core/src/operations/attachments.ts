import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { CoreError } from "../errors.ts";
import { readJsonObject } from "./validation.ts";

export const ATTACHMENTS_RELATIVE = join(".inpainter", "attachments.json");
export const ATTACHMENTS_SCHEMA_VERSION = 1 as const;

export type FolderAttachment = {
  id: string;
  path: string;
};

export type WorkspaceAttachments = {
  schemaVersion: 1;
  folders: FolderAttachment[];
};

export function attachmentsPath(workspace: string): string {
  return join(workspace, ATTACHMENTS_RELATIVE);
}

export function attachmentsToJson(record: WorkspaceAttachments): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function emptyAttachments(): WorkspaceAttachments {
  return { schemaVersion: 1, folders: [] };
}

export function readAttachments(workspace: string): WorkspaceAttachments {
  const path = attachmentsPath(workspace);
  if (!existsSync(path)) {
    return emptyAttachments();
  }
  const value = readJsonObject(path);
  if (value.schemaVersion !== ATTACHMENTS_SCHEMA_VERSION) {
    throw new CoreError(`${path} is not a valid attachments document`);
  }
  if (!Array.isArray(value.folders)) {
    throw new CoreError(`${path} is missing required field folders`);
  }
  return {
    schemaVersion: 1,
    folders: value.folders.map((entry, index) => attachmentFromUnknown(entry, path, index)),
  };
}

export function writeAttachments(workspace: string, record: WorkspaceAttachments): void {
  const path = attachmentsPath(workspace);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, attachmentsToJson(record));
  try {
    renameSync(temporary, path);
  } catch (error) {
    throw new CoreError(`failed to write ${path}: ${error}`);
  }
}

function attachmentFromUnknown(value: unknown, path: string, index: number): FolderAttachment {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError(`${path} folders[${index}] is not an attachment record`);
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const folderPath = typeof record.path === "string" ? record.path.trim() : "";
  if (!id || !folderPath) {
    throw new CoreError(`${path} folders[${index}] is missing required fields`);
  }
  return { id, path: folderPath };
}
