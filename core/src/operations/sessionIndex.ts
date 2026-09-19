import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { CoreError } from "../errors.ts";

export const SESSION_INDEX_RELATIVE = join(".inpainter", "sessions", "index.json");
export const SESSION_SCHEMA_VERSION = 1 as const;

export type SessionRunRecord = {
  id: string;
  status: "completed";
  outputMediaId: string;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  parentId: string | null;
  title: string;
  createdAt: string;
  runs: SessionRunRecord[];
};

export type SessionIndex = {
  schemaVersion: 1;
  sessions: SessionRecord[];
};

export function sessionIndexPath(folder: string): string {
  return join(folder, SESSION_INDEX_RELATIVE);
}

export function emptySessionIndex(): SessionIndex {
  return { schemaVersion: 1, sessions: [] };
}

export function sessionIndexToJson(index: SessionIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

export function parseSessionIndexJson(json: string, path: string): SessionIndex {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse error";
    throw new CoreError(`${path} is not valid JSON: ${message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CoreError(`${path} is not a valid session index`);
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== SESSION_SCHEMA_VERSION) {
    throw new CoreError(`${path} is not a valid session index`);
  }
  if (!Array.isArray(record.sessions)) {
    throw new CoreError(`${path} is missing required field sessions`);
  }
  return {
    schemaVersion: 1,
    sessions: record.sessions.map((entry, index) => parseSession(entry, path, index)),
  };
}

export function readSessionIndex(folder: string): SessionIndex | null {
  const path = sessionIndexPath(folder);
  if (!existsSync(path)) {
    return null;
  }
  return parseSessionIndexJson(readFileSync(path, "utf8"), path);
}

export function writeSessionIndex(folder: string, index: SessionIndex): void {
  const path = sessionIndexPath(folder);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, sessionIndexToJson(index));
  try {
    renameSync(temporary, path);
  } catch (error) {
    throw new CoreError(`failed to write ${path}: ${error}`);
  }
}

/** Create an empty index if missing. If present and corrupt, fail and leave the file. */
export function ensureSessionIndex(folder: string): SessionIndex {
  const existing = readSessionIndex(folder);
  if (existing) {
    return existing;
  }
  const created = emptySessionIndex();
  writeSessionIndex(folder, created);
  return created;
}

function parseSession(entry: unknown, path: string, index: number): SessionRecord {
  const label = `${path} sessions[${index}]`;
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new CoreError(`${label} is not a valid session`);
  }
  const record = entry as Record<string, unknown>;
  const parentId = record.parentId;
  if (parentId !== null && (typeof parentId !== "string" || !parentId.trim())) {
    throw new CoreError(`${label} is missing required field parentId`);
  }
  if (!Array.isArray(record.runs)) {
    throw new CoreError(`${label} is missing required field runs`);
  }
  return {
    id: requiredField(record, "id", label),
    parentId: parentId === null ? null : parentId.trim(),
    title: requiredField(record, "title", label),
    createdAt: requiredField(record, "createdAt", label),
    runs: record.runs.map((run, runIndex) => parseRun(run, `${label} runs[${runIndex}]`)),
  };
}

function parseRun(entry: unknown, label: string): SessionRunRecord {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new CoreError(`${label} is not a valid run`);
  }
  const record = entry as Record<string, unknown>;
  if (record.status !== "completed") {
    throw new CoreError(`${label} is not a valid run`);
  }
  return {
    id: requiredField(record, "id", label),
    status: "completed",
    outputMediaId: requiredField(record, "outputMediaId", label),
    createdAt: requiredField(record, "createdAt", label),
  };
}

function requiredField(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new CoreError(`${path} is missing required field ${key}`);
  }
  return value.trim();
}
