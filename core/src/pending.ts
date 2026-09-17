import {
  chmodSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { CoreError } from "./errors.ts";
import { authDir } from "./paths.ts";
import { ensureAuthDir, nowSecs } from "./session.ts";

const PENDING_FILE = "pending.json";
const PENDING_TTL_SECS = 10 * 60;

export type PendingSignIn = {
  state: string;
  verifier: string;
  expires_at: number;
};

export function writePending(state: string, verifier: string): void {
  const directory = ensureAuthDir();
  const pending: PendingSignIn = {
    state,
    verifier,
    expires_at: nowSecs() + PENDING_TTL_SECS,
  };
  const path = join(directory, PENDING_FILE);
  writeFileSync(path, JSON.stringify(pending));
  if (process.platform !== "win32") {
    chmodSync(path, 0o600);
  }
}

export function takePending(state: string): PendingSignIn {
  const path = join(authDir(), PENDING_FILE);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CoreError("no sign-in is in progress");
    }
    remove(path);
    throw new CoreError("pending sign-in is unreadable");
  }

  let pending: PendingSignIn;
  try {
    const record = data as { state?: unknown; verifier?: unknown; expires_at?: unknown };
    pending = {
      state: String(record.state),
      verifier: String(record.verifier),
      expires_at: Number(record.expires_at),
    };
    if (!pending.state || !pending.verifier || !Number.isFinite(pending.expires_at)) {
      throw new Error("invalid");
    }
  } catch {
    remove(path);
    throw new CoreError("pending sign-in is invalid");
  }

  if (pending.expires_at <= nowSecs()) {
    remove(path);
    throw new CoreError("pending sign-in expired");
  }
  if (pending.state !== state) {
    throw new CoreError("sign-in state mismatch");
  }
  remove(path);
  return pending;
}

export function clearPending(): void {
  remove(join(authDir(), PENDING_FILE));
}

function remove(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
