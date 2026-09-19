/**
 * First-slice writer lease: a live pid owns the document exclusively.
 * Dead pid → next acquire replaces the lock (crash recovery).
 * Pid reuse is a known limitation, not solved here.
 * Acquisition uses O_EXCL ("wx"); atomic rename is not exclusive create.
 */
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

import { CoreError } from "../errors.ts";
import { lockFile } from "../production/paths.ts";

export const LOCK_SCHEMA_VERSION = 1 as const;

export type DocumentLock = {
  schemaVersion: 1;
  holder: string;
  pid: number;
  createdAt: string;
  heartbeatAt: string;
};

export function lockPath(file: string): string {
  return lockFile(file);
}

export function acquireWriterLock(file: string): DocumentLock {
  const path = lockPath(file);
  const now = new Date().toISOString();
  const lock: DocumentLock = {
    schemaVersion: 1,
    holder: randomUUID(),
    pid: process.pid,
    createdAt: now,
    heartbeatAt: now,
  };
  for (;;) {
    try {
      writeLockExclusive(path, lock);
      return lock;
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error instanceof CoreError ? error : new CoreError(`failed to write ${path}: ${error}`);
      }
      if (!existsSync(path)) {
        continue;
      }
      let existing: DocumentLock | undefined;
      for (let attempt = 0; attempt < 25; attempt += 1) {
        try {
          existing = readLockFile(path);
          break;
        } catch {
          sleepMs(1);
        }
      }
      if (!existing) {
        throw new CoreError(`Document is already open for writing: ${path}`);
      }
      if (isPidAlive(existing.pid)) {
        throw new CoreError(
          `Document is already open for writing: ${path} (holder ${existing.holder}, pid ${existing.pid})`,
        );
      }
      try {
        unlinkSync(path);
      } catch {
        // another recoverer may have removed it
      }
    }
  }
}

export function heartbeatWriterLock(file: string, holder: string): void {
  const path = lockPath(file);
  if (!existsSync(path)) {
    throw new CoreError(`Writer lock was lost: ${path}`);
  }
  try {
    const existing = readLockFile(path);
    if (existing.holder !== holder) {
      throw new CoreError(`Writer lock was lost: ${path}`);
    }
    writeLockInPlace(path, { ...existing, heartbeatAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof CoreError && error.message.startsWith("Writer lock was lost")) {
      throw error;
    }
    throw new CoreError(`Writer lock was lost: ${path}`);
  }
}

export function releaseWriterLock(file: string, holder: string): void {
  const path = lockPath(file);
  if (!existsSync(path)) {
    return;
  }
  const existing = readLockFile(path);
  if (existing.holder !== holder) {
    return;
  }
  unlinkSync(path);
}

export function assertWriterAvailable(file: string, holder?: string): void {
  const path = lockPath(file);
  if (!existsSync(path)) {
    return;
  }
  const existing = readLockFile(path);
  if (holder && existing.holder === holder) {
    return;
  }
  if (isPidAlive(existing.pid)) {
    throw new CoreError(
      `Document is already open for writing: ${path} (holder ${existing.holder}, pid ${existing.pid})`,
    );
  }
}

export function withEphemeralWriterLock<T>(file: string, fn: () => T): T {
  assertWriterAvailable(file);
  const lock = acquireWriterLock(file);
  try {
    return fn();
  } finally {
    releaseWriterLock(file, lock.holder);
  }
}

function readLockFile(path: string): DocumentLock {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse error";
    throw new CoreError(`${path} is not valid JSON: ${message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CoreError(`${path} is not a valid document lock`);
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== LOCK_SCHEMA_VERSION) {
    throw new CoreError(`${path} is not a valid document lock`);
  }
  if (typeof record.holder !== "string" || !record.holder) {
    throw new CoreError(`${path} is missing required field holder`);
  }
  if (typeof record.pid !== "number" || !Number.isInteger(record.pid) || record.pid <= 0) {
    throw new CoreError(`${path} is missing required field pid`);
  }
  if (typeof record.createdAt !== "string" || !record.createdAt) {
    throw new CoreError(`${path} is missing required field createdAt`);
  }
  if (typeof record.heartbeatAt !== "string" || !record.heartbeatAt) {
    throw new CoreError(`${path} is missing required field heartbeatAt`);
  }
  return {
    schemaVersion: 1,
    holder: record.holder,
    pid: record.pid,
    createdAt: record.createdAt,
    heartbeatAt: record.heartbeatAt,
  };
}

function writeLockExclusive(path: string, lock: DocumentLock): void {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "wx");
  try {
    writeSync(fd, `${JSON.stringify(lock, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeLockInPlace(path: string, lock: DocumentLock): void {
  writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
}

function isAlreadyExists(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "EEXIST");
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
      return true;
    }
    return false;
  }
}

function sleepMs(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // spin: lock files are tiny; this only covers the wx-to-write window
  }
}
