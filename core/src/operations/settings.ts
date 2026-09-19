import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { CoreError } from "../errors.ts";
import { settingsPath } from "../paths.ts";
import { readJsonObject, validateSettings } from "./validation.ts";

export function getSettings(): Record<string, unknown> {
  const path = settingsPath();
  if (!existsSync(path)) {
    throw new CoreError(`${path} is missing`);
  }
  const value = readJsonObject(path);
  validateSettings(value, path);
  return value;
}

export function updateSettings(patch: Record<string, unknown>): Record<string, unknown> {
  const path = settingsPath();
  const next = { ...getSettings(), ...patch };
  validateSettings(next, path);
  writeJsonAtomic(path, next);
  return next;
}

function writeJsonAtomic(path: string, value: Record<string, unknown>): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  try {
    renameSync(temporary, path);
  } catch (error) {
    throw new CoreError(`failed to write ${path}: ${error}`);
  }
}
