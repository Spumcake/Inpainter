import {
  chmodSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { join } from "node:path";

import { CoreError } from "./errors.ts";
import { authDir } from "./paths.ts";

export const ACCESS_SKEW_SECS = 30;
const SESSION_FILE = "session.enc";
const SESSION_KEY_FILE = "session.key";

export type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

export function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

export function sessionIsFresh(session: StoredSession): boolean {
  return nowSecs() + ACCESS_SKEW_SECS < session.expires_at;
}

export function ensureAuthDir(): string {
  const directory = authDir();
  mkdirSync(directory, { recursive: true });
  if (process.platform !== "win32") {
    chmodSync(directory, 0o700);
  }
  return directory;
}

export function loadSession(): StoredSession | null {
  const directory = ensureAuthDir();
  const path = join(directory, SESSION_FILE);
  try {
    const plain = decrypt(loadOrCreateKey(directory), readFileSync(path));
    const data = JSON.parse(plain.toString("utf8")) as Partial<StoredSession>;
    if (
      typeof data.access_token !== "string" ||
      typeof data.refresh_token !== "string" ||
      typeof data.expires_at !== "number"
    ) {
      return null;
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    };
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession): void {
  const directory = ensureAuthDir();
  const key = loadOrCreateKey(directory);
  const plain = Buffer.from(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    }),
    "utf8",
  );
  writeRestricted(join(directory, SESSION_FILE), encrypt(key, plain));
}

export function clearSession(): void {
  try {
    unlinkSync(join(authDir(), SESSION_FILE));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export function sessionFromTokenBody(body: Record<string, unknown>): StoredSession {
  const accessToken = body.access_token;
  const refreshToken = body.refresh_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new CoreError("missing access_token");
  }
  if (typeof refreshToken !== "string" || !refreshToken) {
    throw new CoreError("missing refresh_token");
  }
  let expiresIn = 3600;
  if (typeof body.expires_in === "number") {
    expiresIn = body.expires_in;
  } else if (body.expires_in != null) {
    const parsed = Number(body.expires_in);
    if (Number.isFinite(parsed)) {
      expiresIn = parsed;
    }
  }
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: nowSecs() + expiresIn,
  };
}

export function encrypt(key: Buffer, plain: Buffer): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, encrypted, cipher.getAuthTag()]);
}

export function decrypt(key: Buffer, blob: Buffer): Buffer {
  if (blob.length < 13) {
    throw new CoreError("session file is truncated");
  }
  try {
    const nonce = blob.subarray(0, 12);
    const tag = blob.subarray(blob.length - 16);
    const data = blob.subarray(12, blob.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    throw new CoreError("failed to decrypt session");
  }
}

function loadOrCreateKey(directory: string): Buffer {
  const path = join(directory, SESSION_KEY_FILE);
  try {
    const key = readFileSync(path);
    if (key.length !== 32) {
      throw new CoreError("session key has unexpected length");
    }
    return key;
  } catch (error) {
    if (error instanceof CoreError) {
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  const key = randomBytes(32);
  writeRestricted(path, key);
  return key;
}

function writeRestricted(path: string, data: Buffer): void {
  writeFileSync(path, data);
  if (process.platform !== "win32") {
    chmodSync(path, 0o600);
  }
}
