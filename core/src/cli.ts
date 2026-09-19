#!/usr/bin/env tsx
import { stdin } from "node:process";

import { CoreError } from "./errors.ts";
import { crash, authorizeUrl, exchange, logout, status } from "./operations/auth.ts";
import { invoke, loadSkill } from "./operations/capabilities.ts";
import { createAgent } from "./operations/agents.ts";
import { homeInit, homeStatus } from "./operations/home.ts";
import { getSettings, updateSettings } from "./operations/settings.ts";
import { createDocument, openDocument, saveDocument } from "./operations/documents.ts";
import { runDocumentSession } from "./operations/documentSession.ts";
import {
  attachFolder,
  detachFolder,
  listFolders,
  openFolderDocument,
} from "./operations/folders.ts";
import { registerAsset, resolveAsset } from "./operations/assets.ts";
import {
  createSession,
  listSessions,
  recordSessionOutput,
  showSession,
} from "./operations/sessions.ts";
import { addWorkspace, createWorkspace, listWorkspaces, removeWorkspace } from "./operations/workspaces.ts";
import { parseRenderSource, renderDocumentFrame } from "./operations/renderFrame.ts";
import { writeJson } from "./output.ts";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) {
    return undefined;
  }
  return args[index + 1];
}

function requireOption(args: string[], name: string): string {
  const value = option(args, name);
  if (!value) {
    throw new CoreError(`${name} is required`);
  }
  return value;
}

function requireIntegerOption(args: string[], name: string): number {
  const raw = requireOption(args, name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new CoreError(`${name} must be a non-negative integer`);
  }
  return value;
}

function requireFiniteOption(args: string[], name: string): number {
  const raw = requireOption(args, name);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new CoreError(`${name} must be a finite number`);
  }
  return value;
}

async function run(argv: string[]): Promise<Record<string, unknown> | null> {
  const [group, command] = argv;
  if (group === "auth" && command === "authorize-url") {
    return authorizeUrl(requireOption(argv, "--redirect-uri"));
  }
  if (group === "auth" && command === "exchange") {
    return exchange(requireOption(argv, "--code"), requireOption(argv, "--state"));
  }
  if (group === "auth" && command === "status") {
    return status();
  }
  if (group === "auth" && command === "logout") {
    return logout();
  }
  if (group === "invoke") {
    const raw = await readStdin();
    const params = raw.trim() ? (JSON.parse(raw) as unknown) : {};
    if (params === null || typeof params !== "object" || Array.isArray(params)) {
      throw new CoreError("Invocation parameters must be an object");
    }
    return invoke(requireOption(argv, "--skill"), params as Record<string, unknown>);
  }
  if (group === "skill" && command === "show") {
    return loadSkill(requireOption(argv, "--id"));
  }
  if (group === "home" && command === "init") {
    return homeInit();
  }
  if (group === "home" && command === "status") {
    return homeStatus();
  }
  if (group === "workspace" && command === "list") {
    return listWorkspaces();
  }
  if (group === "workspace" && command === "create") {
    return createWorkspace({
      name: requireOption(argv, "--name"),
      location: option(argv, "--location"),
    });
  }
  if (group === "workspace" && command === "add") {
    return addWorkspace({ path: requireOption(argv, "--path") });
  }
  if (group === "workspace" && command === "remove") {
    return removeWorkspace({ id: requireOption(argv, "--id") });
  }
  if (group === "agent" && command === "create") {
    return createAgent({
      workspaceId: requireOption(argv, "--workspace-id"),
      directory: option(argv, "--directory"),
    });
  }
  if (group === "settings" && command === "get") {
    return getSettings();
  }
  if (group === "settings" && command === "update") {
    const raw = await readStdin();
    const patch = raw.trim() ? (JSON.parse(raw) as unknown) : {};
    if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
      throw new CoreError("Settings update must be an object");
    }
    return updateSettings(patch as Record<string, unknown>);
  }
  if (group === "document" && command === "create") {
    return createDocument({
      path: requireOption(argv, "--path"),
      name: requireOption(argv, "--name"),
    });
  }
  if (group === "document" && command === "open") {
    return openDocument({ path: requireOption(argv, "--path") });
  }
  if (group === "document" && command === "save") {
    const raw = await readStdin();
    const payload = raw.trim() ? (JSON.parse(raw) as unknown) : {};
    return saveDocument({
      path: requireOption(argv, "--path"),
      payload,
      expectedRevision: requireIntegerOption(argv, "--expected-revision"),
    });
  }
  if (group === "document" && command === "session") {
    await runDocumentSession({ path: requireOption(argv, "--path") });
    return null;
  }
  if (group === "folder" && command === "attach") {
    return attachFolder({
      workspaceId: requireOption(argv, "--workspace-id"),
      path: requireOption(argv, "--path"),
    });
  }
  if (group === "folder" && command === "list") {
    return listFolders({ workspaceId: requireOption(argv, "--workspace-id") });
  }
  if (group === "folder" && command === "detach") {
    return detachFolder({
      workspaceId: requireOption(argv, "--workspace-id"),
      id: requireOption(argv, "--id"),
    });
  }
  if (group === "folder" && command === "open") {
    return openFolderDocument({
      workspaceId: requireOption(argv, "--workspace-id"),
      folderId: requireOption(argv, "--id"),
    });
  }
  if (group === "asset" && command === "register") {
    return registerAsset({
      workspaceId: requireOption(argv, "--workspace-id"),
      folderId: requireOption(argv, "--folder-id"),
      path: requireOption(argv, "--path"),
      copyTo: option(argv, "--copy-to"),
    });
  }
  if (group === "asset" && command === "resolve") {
    return resolveAsset({
      workspaceId: requireOption(argv, "--workspace-id"),
      folderId: requireOption(argv, "--folder-id"),
      mediaId: requireOption(argv, "--id"),
    });
  }
  if (group === "session" && command === "create") {
    return createSession({
      workspaceId: requireOption(argv, "--workspace-id"),
      folderId: requireOption(argv, "--folder-id"),
      title: requireOption(argv, "--title"),
      parentId: option(argv, "--parent-id"),
    });
  }
  if (group === "session" && command === "list") {
    return listSessions({
      workspaceId: requireOption(argv, "--workspace-id"),
      folderId: requireOption(argv, "--folder-id"),
    });
  }
  if (group === "session" && command === "show") {
    return showSession({
      workspaceId: requireOption(argv, "--workspace-id"),
      folderId: requireOption(argv, "--folder-id"),
      id: requireOption(argv, "--id"),
    });
  }
  if (group === "session" && command === "record-output") {
    return recordSessionOutput({
      workspaceId: requireOption(argv, "--workspace-id"),
      folderId: requireOption(argv, "--folder-id"),
      id: requireOption(argv, "--id"),
      mediaId: requireOption(argv, "--media-id"),
    });
  }
  if (group === "render" && command === "frame") {
    return renderDocumentFrame({
      path: requireOption(argv, "--path"),
      time: requireFiniteOption(argv, "--time"),
      source: parseRenderSource(option(argv, "--source")),
      outputPath: option(argv, "--output"),
    });
  }
  throw new CoreError("unknown command");
}

async function main(): Promise<void> {
  try {
    const payload = await run(process.argv.slice(2));
    if (payload !== null) {
      writeJson(payload);
    }
  } catch (error) {
    const message = error instanceof CoreError ? error.message : String(error);
    try {
      writeJson(await crash(message));
    } catch {
      writeJson({ error: message });
    }
    process.exitCode = 1;
  }
}

await main();
