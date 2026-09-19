import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { homeInit } from "../src/operations/home.ts";
import { createDocument } from "../src/operations/documents.ts";
import {
  DEFAULT_DOCUMENT_RELATIVE,
  folderManifestPath,
  writeFolderManifest,
} from "../src/operations/folderManifest.ts";
import { attachmentsPath } from "../src/operations/attachments.ts";
import {
  attachFolder,
  detachFolder,
  listFolders,
  openFolderDocument,
} from "../src/operations/folders.ts";
import { createWorkspace } from "../src/operations/workspaces.ts";

const originalHome = process.env.INPAINTER_HOME;
const originalSkills = process.env.INPAINTER_SKILLS_DIR;
const repoBootstrap = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../installer/setup/bootstrap",
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

function isolatedHome(): string {
  const home = mkdtempSync(join(tmpdir(), "inpainter-folders-home-"));
  process.env.INPAINTER_HOME = home;
  delete process.env.INPAINTER_SKILLS_DIR;
  cpSync(repoBootstrap, join(home, "bootstrap"), { recursive: true });
  return home;
}

function workspaceAndFolder(): { home: string; workspaceId: string; workspacePath: string; folder: string } {
  const home = isolatedHome();
  homeInit();
  const workspace = createWorkspace({
    name: "Film Development",
    location: mkdtempSync(join(tmpdir(), "inpainter-folders-workspace-")),
  });
  const folder = mkdtempSync(join(tmpdir(), "inpainter-production-folder-"));
  return { home, workspaceId: workspace.id, workspacePath: workspace.path, folder };
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

describe("production folder operations", () => {
  it("attaches a folder outside the workspace and reopens it by id from a fresh CLI process", () => {
    const { home, workspaceId, folder } = workspaceAndFolder();
    writeFileSync(join(folder, "notes.txt"), "keep");
    const attached = attachFolder({ workspaceId, path: folder });
    expect(attached.folder.path).toBe(resolve(folder));
    expect(attached.folder.available).toBe(true);
    expect(attached.folder.document).toBe(DEFAULT_DOCUMENT_RELATIVE);
    expect(existsSync(join(folder, ".inpainter", "production", "project.oreel"))).toBe(true);
    expect(existsSync(join(folder, ".inpainter", "production", "project.commit.json"))).toBe(true);
    expect(existsSync(join(folder, ".inpainter", "sessions", "index.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(folder, ".inpainter", "sessions", "index.json"), "utf8"))).toEqual({
      schemaVersion: 1,
      sessions: [],
    });
    expect(existsSync(join(folder, ".inpainter", "tools", "canvas.tool.json"))).toBe(false);
    expect(existsSync(join(folder, "notes.txt"))).toBe(true);

    const listed = parseCli(home, ["folder", "list", "--workspace-id", workspaceId]);
    const folders = listed.folders as Array<{ id: string; documentId: string }>;
    expect(folders).toHaveLength(1);
    expect(folders[0].id).toBe(attached.folder.id);
    expect(folders[0].documentId).toBe(attached.document.id);

    const opened = parseCli(home, [
      "folder",
      "open",
      "--workspace-id",
      workspaceId,
      "--id",
      attached.folder.id,
    ]);
    expect(opened.id).toBe(attached.document.id);
    expect(opened.name).toBe(attached.document.name);
  });

  it("detaches membership only, then reattaches the same folder and document ids", () => {
    const { workspaceId, folder } = workspaceAndFolder();
    writeFileSync(join(folder, "clip.mp4"), "media");
    const attached = attachFolder({ workspaceId, path: folder });
    expect(detachFolder({ workspaceId, id: attached.folder.id })).toEqual({
      detached: true,
      id: attached.folder.id,
    });
    expect(listFolders({ workspaceId }).folders).toEqual([]);
    expect(existsSync(join(folder, "clip.mp4"))).toBe(true);
    expect(existsSync(join(folder, ".inpainter", "production", "project.oreel"))).toBe(true);
    expect(existsSync(folderManifestPath(folder))).toBe(true);

    const reattached = attachFolder({ workspaceId, path: folder });
    expect(reattached.folder.id).toBe(attached.folder.id);
    expect(reattached.document.id).toBe(attached.document.id);
    expect(readFileSync(join(folder, "clip.mp4"), "utf8")).toBe("media");
  });

  it("keeps two attached folders independent", () => {
    const { workspaceId, folder } = workspaceAndFolder();
    const second = mkdtempSync(join(tmpdir(), "inpainter-production-folder-b-"));
    const first = attachFolder({ workspaceId, path: folder });
    const other = attachFolder({ workspaceId, path: second });
    expect(other.folder.id).not.toBe(first.folder.id);
    expect(other.document.id).not.toBe(first.document.id);
    const listed = listFolders({ workspaceId }).folders;
    expect(listed).toHaveLength(2);
    expect(listed.map((entry) => entry.id).sort()).toEqual(
      [first.folder.id, other.folder.id].sort(),
    );
  });

  it("reuses an existing folder.json and document on first attach", () => {
    const { workspaceId, folder } = workspaceAndFolder();
    const prepared = createDocument({
      path: join(folder, ".inpainter", "production", "project.oreel"),
      name: "Prepared",
    });
    writeFolderManifest(folder, {
      schemaVersion: 1,
      id: "keep-folder-id",
      name: "Prepared",
      documentId: prepared.id,
      document: DEFAULT_DOCUMENT_RELATIVE,
    });
    const attached = attachFolder({ workspaceId, path: folder });
    expect(attached.folder.id).toBe("keep-folder-id");
    expect(attached.document.id).toBe(prepared.id);
    expect(listFolders({ workspaceId }).folders).toHaveLength(1);
  });

  it("fails attach on corrupt folder.json and does not publish membership", () => {
    const { workspaceId, workspacePath, folder } = workspaceAndFolder();
    mkdirSync(join(folder, ".inpainter"), { recursive: true });
    const manifestPath = folderManifestPath(folder);
    const garbage = "{not-json";
    writeFileSync(manifestPath, garbage);
    expect(() => attachFolder({ workspaceId, path: folder })).toThrow(CoreError);
    expect(() => attachFolder({ workspaceId, path: folder })).toThrow(manifestPath);
    expect(readFileSync(manifestPath, "utf8")).toBe(garbage);
    expect(existsSync(attachmentsPath(workspacePath))).toBe(false);
  });

  it("refuses duplicate path and duplicate folder identity", () => {
    const { workspaceId, folder } = workspaceAndFolder();
    const attached = attachFolder({ workspaceId, path: folder });
    expect(() => attachFolder({ workspaceId, path: folder })).toThrow(/already attached/);
    const copy = mkdtempSync(join(tmpdir(), "inpainter-production-copy-"));
    cpSync(folder, copy, { recursive: true });
    expect(() => attachFolder({ workspaceId, path: copy })).toThrow(/already attached/);
    expect(listFolders({ workspaceId }).folders).toHaveLength(1);
    expect(listFolders({ workspaceId }).folders[0].id).toBe(attached.folder.id);
  });

  it("rejects an unavailable attach path and lists a missing folder as unavailable", () => {
    const { workspaceId } = workspaceAndFolder();
    const missing = join(tmpdir(), `inpainter-missing-folder-${Date.now()}`);
    expect(() => attachFolder({ workspaceId, path: missing })).toThrow(CoreError);
    expect(() => attachFolder({ workspaceId, path: missing })).toThrow(missing);

    const folder = mkdtempSync(join(tmpdir(), "inpainter-production-gone-"));
    const attached = attachFolder({ workspaceId, path: folder });
    rmSync(folder, { recursive: true, force: true });
    const listed = listFolders({ workspaceId }).folders;
    expect(listed).toEqual([
      {
        id: attached.folder.id,
        name: "",
        path: attached.folder.path,
        documentId: "",
        document: "",
        available: false,
      },
    ]);
    expect(() => openFolderDocument({ workspaceId, folderId: attached.folder.id })).toThrow(
      /does not exist or is not a folder/,
    );
  });

  it("recovers failed initialization without reporting a ready attachment", () => {
    const { workspaceId, workspacePath, folder } = workspaceAndFolder();
    expect(() => attachFolder({ workspaceId, path: folder, failAfter: "document" })).toThrow(
      /injected failure after document/,
    );
    expect(listFolders({ workspaceId }).folders).toEqual([]);
    expect(existsSync(attachmentsPath(workspacePath))).toBe(false);
    expect(existsSync(folderManifestPath(folder))).toBe(false);
    const envelope = JSON.parse(
      readFileSync(join(folder, ".inpainter", "production", "project.oreel"), "utf8"),
    ) as { project: { id: string } };

    const recovered = attachFolder({ workspaceId, path: folder });
    expect(recovered.document.id).toBe(envelope.project.id);
    expect(listFolders({ workspaceId }).folders).toHaveLength(1);

    const other = mkdtempSync(join(tmpdir(), "inpainter-production-manifest-fail-"));
    expect(() => attachFolder({ workspaceId, path: other, failAfter: "manifest" })).toThrow(
      /injected failure after manifest/,
    );
    expect(listFolders({ workspaceId }).folders).toHaveLength(1);
    const savedId = JSON.parse(readFileSync(folderManifestPath(other), "utf8")) as { id: string };
    const published = attachFolder({ workspaceId, path: other });
    expect(published.folder.id).toBe(savedId.id);
    expect(listFolders({ workspaceId }).folders).toHaveLength(2);
  });
});
