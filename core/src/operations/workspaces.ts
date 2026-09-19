import { existsSync, mkdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { CoreError } from "../errors.ts";
import { launcherRegistryPath, localWorkspaceDir, workspacesDir } from "../paths.ts";
import { readJsonObject, validateLauncher } from "./validation.ts";
import {
  ensureManifest,
  readManifest,
  seedDefaults,
  slugify,
  validateFolderName,
  type WorkspaceIdentity,
} from "./workspaceManifest.ts";

export const LOCAL_WORKSPACE_ID = "local";

export type WorkspaceRecord = {
  id: string;
  name: string;
  path: string;
};

type LauncherRegistry = {
  workspaces: WorkspaceRecord[];
};

export function ensureLocalWorkspace(): WorkspaceRecord {
  const workspace = localWorkspaceDir();
  mkdirSync(workspace, { recursive: true });
  const manifest = ensureManifest(workspace, {
    id: LOCAL_WORKSPACE_ID,
    name: "Local",
    slug: "local",
  });
  seedDefaults(workspace);
  return { id: manifest.id, name: manifest.name, path: workspace };
}

export function listWorkspaces(): { workspaces: WorkspaceRecord[] } {
  const local = ensureLocalWorkspace();
  const registry = loadRegistry();
  let changed = false;
  const refreshed = registry.workspaces.map((record) => {
    const next = refreshListedWorkspace(record);
    if (next.id !== record.id || next.name !== record.name) {
      changed = true;
    }
    return next;
  });
  if (changed) {
    saveRegistry({ workspaces: refreshed });
  }
  const workspaces = [local];
  for (const record of refreshed) {
    if (record.id === LOCAL_WORKSPACE_ID || samePath(record.path, local.path)) {
      continue;
    }
    workspaces.push(record);
  }
  return { workspaces };
}

export function createWorkspace(input: { name: string; location?: string }): WorkspaceRecord {
  const name = input.name.trim();
  if (!name) {
    throw new CoreError("Workspace name is required.");
  }
  const location = resolveCreateLocation(input.location);
  mkdirSync(location, { recursive: true });
  if (!existsSync(location) || !statSync(location).isDirectory()) {
    throw new CoreError(`Location does not exist or is not a folder: ${location}`);
  }
  const folderName = slugify(name);
  validateFolderName(folderName);
  const dest = join(location, folderName);
  if (existsSync(dest)) {
    throw new CoreError(`A workspace folder named ${folderName} already exists in this location.`);
  }
  const registry = loadRegistry();
  try {
    const record = initializeWorkspace(dest, {
      id: randomUUID(),
      name,
      slug: folderName,
    });
    registerWorkspaceIn(registry, record);
    saveRegistry(registry);
    return record;
  } catch (error) {
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
    }
    throw error;
  }
}

export function addWorkspace(input: { path: string }): WorkspaceRecord {
  const selected = resolve(input.path.trim());
  if (!existsSync(selected) || !statSync(selected).isDirectory()) {
    throw new CoreError(`Location does not exist or is not a folder: ${selected}`);
  }
  const canonical = realpathSync(selected);
  if (samePath(localWorkspaceDir(), canonical)) {
    throw new CoreError("That folder is already the Local workspace.");
  }
  const registry = loadRegistry();
  const record = initializeWorkspace(canonical);
  registerWorkspaceIn(registry, record);
  saveRegistry(registry);
  return record;
}

export function requireWorkspace(id: string): WorkspaceRecord {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new CoreError("Workspace id is required.");
  }
  const found = listWorkspaces().workspaces.find((workspace) => workspace.id === trimmed);
  if (!found) {
    throw new CoreError(`Workspace not found: ${trimmed}`);
  }
  return found;
}

export function removeWorkspace(input: { id: string }): { removed: true } {
  if (input.id === LOCAL_WORKSPACE_ID) {
    throw new CoreError("The Local workspace cannot be removed.");
  }
  const registry = loadRegistry();
  const before = registry.workspaces.length;
  registry.workspaces = registry.workspaces.filter((workspace) => workspace.id !== input.id);
  if (registry.workspaces.length === before) {
    throw new CoreError("That workspace is not in the launcher.");
  }
  saveRegistry(registry);
  return { removed: true };
}

function initializeWorkspace(path: string, identity?: WorkspaceIdentity): WorkspaceRecord {
  mkdirSync(path, { recursive: true });
  if (!statSync(path).isDirectory()) {
    throw new CoreError(`Location does not exist or is not a folder: ${path}`);
  }
  const manifest = ensureManifest(path, identity);
  seedDefaults(path);
  return { id: manifest.id, name: manifest.name, path };
}

function resolveCreateLocation(location?: string): string {
  const trimmed = location?.trim() ?? "";
  if (!trimmed) {
    return workspacesDir();
  }
  return resolve(trimmed);
}

function loadRegistry(): LauncherRegistry {
  const path = launcherRegistryPath();
  if (!existsSync(path)) {
    return { workspaces: [] };
  }
  const value = readJsonObject(path);
  validateLauncher(value, path);
  const workspaces = Array.isArray(value.workspaces) ? value.workspaces : [];
  return {
    workspaces: workspaces.map((entry, index) => workspaceRecordFromUnknown(entry, path, index)),
  };
}

function saveRegistry(registry: LauncherRegistry): void {
  const path = launcherRegistryPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`);
}

function workspaceRecordFromUnknown(
  value: unknown,
  path: string,
  index: number,
): WorkspaceRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError(`${path} workspaces[${index}] is not a workspace record`);
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const workspacePath = typeof record.path === "string" ? record.path.trim() : "";
  if (!id || !name || !workspacePath) {
    throw new CoreError(`${path} workspaces[${index}] is missing required fields`);
  }
  return { id, name, path: workspacePath };
}

function registerWorkspaceIn(registry: LauncherRegistry, record: WorkspaceRecord): void {
  if (registry.workspaces.some((workspace) => samePath(workspace.path, record.path))) {
    throw new CoreError(`This folder is already a workspace tab: ${record.path}`);
  }
  if (
    record.id === LOCAL_WORKSPACE_ID ||
    registry.workspaces.some((workspace) => workspace.id === record.id)
  ) {
    throw new CoreError("A workspace with that identity is already in the launcher.");
  }
  registry.workspaces.push(record);
}

function refreshListedWorkspace(record: WorkspaceRecord): WorkspaceRecord {
  try {
    const manifest = readManifest(record.path);
    if (!manifest) {
      return record;
    }
    return { id: manifest.id, name: manifest.name, path: record.path };
  } catch {
    return record;
  }
}

function samePath(stored: string, candidate: string): boolean {
  try {
    return realpathSync(stored) === realpathSync(candidate);
  } catch {
    return resolve(stored) === resolve(candidate);
  }
}
