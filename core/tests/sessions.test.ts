import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { homeInit } from "../src/operations/home.ts";
import { attachFolder } from "../src/operations/folders.ts";
import { recordSessionOutput } from "../src/operations/sessions.ts";
import { sessionIndexPath } from "../src/operations/sessionIndex.ts";
import { createWorkspace } from "../src/operations/workspaces.ts";

const originalHome = process.env.INPAINTER_HOME;
const originalSkills = process.env.INPAINTER_SKILLS_DIR;
const repoBootstrap = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../installer/setup/bootstrap",
);
const fixtureImage = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/production/assets/accent.png",
);
const tsx = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/.bin/tsx");
const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../src/cli.ts");

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.INPAINTER_HOME;
  } else {
    process.env.INPAINTER_HOME = originalHome;
  }
  if (originalSkills === undefined) {
    delete process.env.INPAINTER_SKILLS_DIR;
  } else {
    process.env.INPAINTER_SKILLS_DIR = originalSkills;
  }
});

describe("folder session history", () => {
  it("records a child output against the same production asset identity", { timeout: 15_000 }, () => {
    const { home, workspaceId, folderId, folder } = attachedFolder();
    const mediaId = registerFixture(home, workspaceId, folderId, folder);

    const parent = parseCli(home, [
      "session",
      "create",
      "--workspace-id",
      workspaceId,
      "--folder-id",
      folderId,
      "--title",
      "Concept",
    ]);
    expect(parent.parentId).toBeNull();
    expect(parent.runs).toEqual([]);

    const child = parseCli(home, [
      "session",
      "create",
      "--workspace-id",
      workspaceId,
      "--folder-id",
      folderId,
      "--title",
      "Image generation",
      "--parent-id",
      String(parent.id),
    ]);
    expect(child.parentId).toBe(parent.id);

    const recorded = parseCli(home, [
      "session",
      "record-output",
      "--workspace-id",
      workspaceId,
      "--folder-id",
      folderId,
      "--id",
      String(child.id),
      "--media-id",
      mediaId,
    ]);
    expect(recorded.runs).toEqual([
      expect.objectContaining({ status: "completed", outputMediaId: mediaId }),
    ]);

    const shown = parseCli(home, [
      "session",
      "show",
      "--workspace-id",
      workspaceId,
      "--folder-id",
      folderId,
      "--id",
      String(child.id),
    ]);
    expect((shown.runs as Array<{ outputMediaId: string }>)[0].outputMediaId).toBe(mediaId);

    const resolved = parseCli(home, [
      "asset",
      "resolve",
      "--workspace-id",
      workspaceId,
      "--folder-id",
      folderId,
      "--id",
      mediaId,
    ]);
    expect(resolved.mediaId).toBe(mediaId);
    expect(resolved.relativePath).toBe("Images/accent.png");

    const opened = parseCli(home, ["folder", "open", "--workspace-id", workspaceId, "--id", folderId]);
    expect(opened).not.toHaveProperty("sessions");
    expect((opened.assets as { items: Record<string, { relativePath: string }> }).items[mediaId]).toEqual({
      relativePath: "Images/accent.png",
    });
    expect(JSON.stringify(opened)).not.toMatch(/outputMediaId/);
  });

  it("survives a fresh CLI process and detach/reattach", { timeout: 15_000 }, () => {
    const { home, workspaceId, folderId, folder } = attachedFolder();
    const mediaId = registerFixture(home, workspaceId, folderId, folder);
    const parent = parseCli(home, sessionArgs(workspaceId, folderId, ["create", "--title", "Parent"]));
    const child = parseCli(
      home,
      sessionArgs(workspaceId, folderId, [
        "create",
        "--title",
        "Child",
        "--parent-id",
        String(parent.id),
      ]),
    );
    parseCli(
      home,
      sessionArgs(workspaceId, folderId, [
        "record-output",
        "--id",
        String(child.id),
        "--media-id",
        mediaId,
      ]),
    );

    const listed = parseCli(home, sessionArgs(workspaceId, folderId, ["list"]));
    const sessions = listed.sessions as Array<{ id: string; parentId: string | null }>;
    expect(sessions.map((session) => session.id).sort()).toEqual([parent.id, child.id].sort());

    parseCli(home, ["folder", "detach", "--workspace-id", workspaceId, "--id", folderId]);
    const reattached = parseCli(home, ["folder", "attach", "--workspace-id", workspaceId, "--path", folder]);
    expect((reattached.folder as { id: string }).id).toBe(folderId);

    const shown = parseCli(home, sessionArgs(workspaceId, folderId, ["show", "--id", String(child.id)]));
    expect(shown.parentId).toBe(parent.id);
    expect((shown.runs as Array<{ outputMediaId: string }>)[0].outputMediaId).toBe(mediaId);
    const resolved = parseCli(home, [
      "asset",
      "resolve",
      "--workspace-id",
      workspaceId,
      "--folder-id",
      folderId,
      "--id",
      mediaId,
    ]);
    expect(readFileSync(String(resolved.path))).toEqual(readFileSync(fixtureImage));
  });

  it("keeps a second folder's session store independent", () => {
    const { home, workspaceId, folderId } = attachedFolder();
    const parent = parseCli(home, sessionArgs(workspaceId, folderId, ["create", "--title", "Shot A"]));
    const secondPath = mkdtempSync(join(tmpdir(), "inpainter-sessions-folder-b-"));
    const second = parseCli(home, ["folder", "attach", "--workspace-id", workspaceId, "--path", secondPath]);
    const secondId = String((second.folder as { id: string }).id);

    const listed = parseCli(home, sessionArgs(workspaceId, secondId, ["list"]));
    expect(listed.sessions).toEqual([]);

    const orphan = runCli(
      home,
      sessionArgs(workspaceId, secondId, ["create", "--title", "Orphan", "--parent-id", String(parent.id)]),
    );
    expect(orphan.status).not.toBe(0);
    expect(`${orphan.stdout}${orphan.stderr}`).toMatch(/Parent session not found/);
  });

  it("refuses an unknown media id and leaves a corrupt index untouched", () => {
    const { home, workspaceId, folderId, folder } = attachedFolder();
    const child = parseCli(home, sessionArgs(workspaceId, folderId, ["create", "--title", "Child"]));
    expect(() =>
      recordSessionOutput({
        workspaceId,
        folderId,
        id: String(child.id),
        mediaId: "missing-media",
      }),
    ).toThrow(CoreError);
    expect(() =>
      recordSessionOutput({
        workspaceId,
        folderId,
        id: String(child.id),
        mediaId: "missing-media",
      }),
    ).toThrow(/Asset not found/);

    const indexPath = sessionIndexPath(folder);
    const garbage = "{not-json";
    writeFileSync(indexPath, garbage);
    const listed = runCli(home, sessionArgs(workspaceId, folderId, ["list"]));
    expect(listed.status).not.toBe(0);
    expect(`${listed.stdout}${listed.stderr}`).toMatch(/not valid JSON/);
    expect(existsSync(indexPath)).toBe(true);
    expect(readFileSync(indexPath, "utf8")).toBe(garbage);
  });
});

function isolatedHome(): string {
  const home = mkdtempSync(join(tmpdir(), "inpainter-sessions-home-"));
  process.env.INPAINTER_HOME = home;
  delete process.env.INPAINTER_SKILLS_DIR;
  cpSync(repoBootstrap, join(home, "bootstrap"), { recursive: true });
  return home;
}

function attachedFolder(): { home: string; workspaceId: string; folderId: string; folder: string } {
  const home = isolatedHome();
  homeInit();
  const workspace = createWorkspace({
    name: "Film Development",
    location: mkdtempSync(join(tmpdir(), "inpainter-sessions-workspace-")),
  });
  const folder = mkdtempSync(join(tmpdir(), "inpainter-sessions-folder-"));
  const attached = attachFolder({ workspaceId: workspace.id, path: folder });
  return { home, workspaceId: workspace.id, folderId: attached.folder.id, folder };
}

function registerFixture(home: string, workspaceId: string, folderId: string, folder: string): string {
  mkdirSync(join(folder, "Images"), { recursive: true });
  const imagePath = join(folder, "Images", "accent.png");
  cpSync(fixtureImage, imagePath);
  const registered = parseCli(home, [
    "asset",
    "register",
    "--workspace-id",
    workspaceId,
    "--folder-id",
    folderId,
    "--path",
    imagePath,
  ]);
  return String(registered.mediaId);
}

function sessionArgs(workspaceId: string, folderId: string, rest: string[]): string[] {
  return ["session", ...rest, "--workspace-id", workspaceId, "--folder-id", folderId];
}

function runCli(home: string, args: string[]): { stdout: string; status: number; stderr: string } {
  const result = spawnSync(tsx, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, INPAINTER_HOME: home },
  });
  return { stdout: result.stdout, status: result.status ?? 1, stderr: result.stderr };
}

function parseCli(home: string, args: string[]): Record<string, unknown> {
  const result = runCli(home, args);
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}
