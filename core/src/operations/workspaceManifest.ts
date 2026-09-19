import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { CoreError } from "../errors.ts";
import { defaultsDir } from "../paths.ts";
import { readJsonObject } from "./validation.ts";

export const WORKSPACE_INPAINTER = "pre-alpha";
export const MANIFEST_RELATIVE_PATH = join(".inpainter", "workspace.json");

const MANIFEST_KEY_ORDER = ["id", "name", "slug", "created", "modified", "inpainter"] as const;
const MANIFEST_RESERVED_KEYS = [
  "id",
  "name",
  "slug",
  "created",
  "modified",
  "inpainter",
  "version",
  "schema_version",
];

export type WorkspaceManifest = {
  id: string;
  name: string;
  slug: string;
  created: string;
  modified: string;
  inpainter: string;
};

export type WorkspaceIdentity = {
  id: string;
  name: string;
  slug: string;
};

export function slugify(name: string): string {
  let slug = "";
  let dash = false;
  for (const ch of name) {
    if (isAlphanumeric(ch)) {
      slug += ch.toLowerCase();
      dash = false;
    } else if (slug.length > 0 && !dash) {
      slug += "-";
      dash = true;
    }
  }
  slug = slug.replace(/^-+|-+$/gu, "");
  return slug || "workspace";
}

export function validateFolderName(name: string): void {
  if (!name) {
    throw new CoreError("Workspace folder name is required.");
  }
  if (name === "." || name === "..") {
    throw new CoreError("Workspace folder name is invalid.");
  }
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
    throw new CoreError("Workspace folder name must be a single folder, not a path.");
  }
}

export function readManifest(workspace: string): WorkspaceManifest | null {
  const path = join(workspace, MANIFEST_RELATIVE_PATH);
  if (!existsSync(path)) {
    return null;
  }
  const value = readJsonObject(path);
  const name = jsonString(value, "name");
  if (!name) {
    throw new CoreError(`${path} is missing required field name`);
  }
  const folderSlug = slugify(basename(workspace) || name);
  const id = jsonString(value, "id") ?? randomUUID();
  const slug = jsonString(value, "slug") ?? folderSlug;
  try {
    validateFolderName(slug);
  } catch (error) {
    const message = error instanceof CoreError ? error.message : String(error);
    throw new CoreError(`${path}: ${message}`);
  }
  const created = jsonString(value, "created") ?? timestampFromFile(path) ?? timestampNow();
  const modified = jsonString(value, "modified") ?? timestampNow();
  const inpainter =
    jsonString(value, "inpainter") ?? jsonString(value, "version") ?? WORKSPACE_INPAINTER;
  const manifest: WorkspaceManifest = { id, name, slug, created, modified, inpainter };
  const needsRewrite =
    ["id", "slug", "created", "modified", "inpainter"].some((key) => jsonString(value, key) === undefined) ||
    Object.hasOwn(value, "schema_version") ||
    Object.hasOwn(value, "version") ||
    !coreKeysInOrder(value);
  if (needsRewrite) {
    replaceManifest(workspace, manifest, value);
  }
  return manifest;
}

export function writeManifest(workspace: string, manifest: WorkspaceManifest): void {
  const path = join(workspace, MANIFEST_RELATIVE_PATH);
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const bytes = encodeManifest(manifest);
  try {
    writeFileSync(path, bytes, { flag: "wx" });
  } catch {
    throw new CoreError(`failed to create ${path}`);
  }
}

export function ensureManifest(workspace: string, identity?: WorkspaceIdentity): WorkspaceManifest {
  const existing = readManifest(workspace);
  if (existing) {
    return existing;
  }
  const created = identity ? manifestFromIdentity(identity) : inferManifest(workspace);
  writeManifest(workspace, created);
  return created;
}

export function seedDefaults(workspace: string): void {
  const defaults = defaultsDir();
  if (!existsSync(defaults) || !statSync(defaults).isDirectory()) {
    throw new CoreError(`Workspace defaults folder is missing: ${defaults}`);
  }
  copyDefaults(defaults, join(workspace, ".inpainter"));
}

function manifestFromIdentity(identity: WorkspaceIdentity): WorkspaceManifest {
  const now = timestampNow();
  return {
    id: identity.id,
    name: identity.name,
    slug: identity.slug,
    created: now,
    modified: now,
    inpainter: WORKSPACE_INPAINTER,
  };
}

function inferManifest(workspace: string): WorkspaceManifest {
  const name = basename(workspace);
  if (!name) {
    throw new CoreError("Could not determine a workspace name from that folder.");
  }
  const slug = slugify(name);
  validateFolderName(slug);
  return manifestFromIdentity({
    id: randomUUID(),
    name,
    slug,
  });
}

function copyDefaults(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const name = entry.name;
    if (name === "structure.json" || name === "workspace.json") {
      continue;
    }
    const from = join(source, name);
    const to = join(destination, name);
    if (entry.isDirectory()) {
      copyDefaults(from, to);
      continue;
    }
    if (entry.isFile() && !existsSync(to)) {
      copyFileSync(from, to);
    }
  }
}

function replaceManifest(
  workspace: string,
  manifest: WorkspaceManifest,
  extra: Record<string, unknown>,
): void {
  const path = join(workspace, MANIFEST_RELATIVE_PATH);
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const temporary = join(parent, `.workspace-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, encodeManifest(manifest, extra));
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) {
      try {
        unlinkSync(temporary);
      } catch {
        // Ignore leftover temp files if rewrite failed.
      }
    }
    throw new CoreError(`failed to update ${path}: ${error}`);
  }
}

function encodeManifest(manifest: WorkspaceManifest, extra?: Record<string, unknown>): string {
  const out: Record<string, unknown> = {
    id: manifest.id,
    name: manifest.name,
    slug: manifest.slug,
    created: manifest.created,
    modified: manifest.modified,
    inpainter: manifest.inpainter,
  };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (MANIFEST_RESERVED_KEYS.includes(key)) {
        continue;
      }
      out[key] = value;
    }
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

function jsonString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  if (typeof field !== "string") {
    return undefined;
  }
  const trimmed = field.trim();
  return trimmed || undefined;
}

function coreKeysInOrder(value: Record<string, unknown>): boolean {
  const present = Object.keys(value).filter((key) =>
    (MANIFEST_KEY_ORDER as readonly string[]).includes(key),
  );
  const expected = MANIFEST_KEY_ORDER.filter((key) => Object.hasOwn(value, key));
  return present.length === expected.length && present.every((key, index) => key === expected[index]);
}

function timestampNow(): string {
  return new Date().toISOString();
}

function timestampFromFile(path: string): string | undefined {
  try {
    const stats = statSync(path);
    const time = stats.birthtimeMs > 0 ? stats.birthtime : stats.mtime;
    return time.toISOString();
  } catch {
    return undefined;
  }
}

function isAlphanumeric(ch: string): boolean {
  return /\p{L}|\p{N}/u.test(ch);
}
