import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { coreStateDir } from "./paths.ts";

const STATE_FILE = "state.json";

export function loadState(): string | null {
  try {
    const data = JSON.parse(readFileSync(statePath(), "utf8")) as unknown;
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    const state = (data as { state?: unknown }).state;
    return typeof state === "string" ? state : null;
  } catch {
    return null;
  }
}

export function persistState(state: string): void {
  const directory = coreStateDir();
  mkdirSync(directory, { recursive: true });
  restrictDir(directory);
  const path = join(directory, STATE_FILE);
  writeFileSync(path, JSON.stringify({ state }));
  restrictFile(path);
}

function statePath(): string {
  return join(coreStateDir(), STATE_FILE);
}

function restrictDir(path: string): void {
  if (process.platform !== "win32") {
    chmodSync(path, 0o700);
  }
}

function restrictFile(path: string): void {
  if (process.platform !== "win32") {
    chmodSync(path, 0o600);
  }
}
