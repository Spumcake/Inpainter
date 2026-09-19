import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { homeInit } from "../src/operations/home.ts";
import { registerAsset, resolveAsset } from "../src/operations/assets.ts";
import { attachFolder, detachFolder, openFolderDocument } from "../src/operations/folders.ts";
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

function isolatedHome(): string {
  const home = mkdtempSync(join(tmpdir(), "inpainter-assets-home-"));
  process.env.INPAINTER_HOME = home;
  delete process.env.INPAINTER_SKILLS_DIR;
  cpSync(repoBootstrap, join(home, "bootstrap"), { recursive: true });
  return home;
}

function attachedFolder(): {
  home: string;
  workspaceId: string;
  folderId: string;
  folder: string;
} {
  const home = isolatedHome();
  homeInit();
  const workspace = createWorkspace({
    name: "Film Development",
    location: mkdtempSync(join(tmpdir(), "inpainter-assets-workspace-")),
  });
  const folder = mkdtempSync(join(tmpdir(), "inpainter-assets-folder-"));
  const attached = attachFolder({ workspaceId: workspace.id, path: folder });
  return { home, workspaceId: workspace.id, folderId: attached.folder.id, folder };
}

function placeFixture(folder: string, relative = "Images/accent.png"): string {
  const dest = join(folder, ...relative.split("/"));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(fixtureImage, dest);
  return dest;
}

function runCli(
  home: string,
  args: string[],
  cwd?: string,
): { stdout: string; status: number; stderr: string } {
  const result = spawnSync(tsx, [cli, ...args], {
    encoding: "utf8",
    cwd,
    env: { ...process.env, INPAINTER_HOME: home },
  });
  return { stdout: result.stdout, status: result.status ?? 1, stderr: result.stderr };
}

describe("production folder assets", () => {
  it("registers a visible Images/ file and resolves the same bytes from an unrelated cwd", () => {
    const { home, workspaceId, folderId, folder } = attachedFolder();
    const source = placeFixture(folder);
    const original = readFileSync(source);
    const registered = registerAsset({ workspaceId, folderId, path: source });
    expect(registered.relativePath).toBe("Images/accent.png");
    expect(registered.path).toBe(source);
    expect(registered.byteLength).toBe(original.length);
    expect(existsSync(join(folder, ".inpainter", "production", "project_media"))).toBe(false);

    const cwd = mkdtempSync(join(tmpdir(), "inpainter-assets-cwd-"));
    const resolved = runCli(
      home,
      [
        "asset",
        "resolve",
        "--workspace-id",
        workspaceId,
        "--folder-id",
        folderId,
        "--id",
        registered.mediaId,
      ],
      cwd,
    );
    expect(resolved.status, resolved.stderr || resolved.stdout).toBe(0);
    const payload = JSON.parse(resolved.stdout) as {
      mediaId: string;
      relativePath: string;
      path: string;
      byteLength: number;
    };
    expect(payload.mediaId).toBe(registered.mediaId);
    expect(payload.relativePath).toBe("Images/accent.png");
    expect(readFileSync(payload.path)).toEqual(original);
    expect(payload.byteLength).toBe(original.length);
  });

  it("keeps relative locators valid after the production folder is moved", () => {
    const { workspaceId, folderId, folder } = attachedFolder();
    const source = placeFixture(folder);
    const original = readFileSync(source);
    const registered = registerAsset({ workspaceId, folderId, path: source });
    detachFolder({ workspaceId, id: folderId });
    const moved = `${folder}-moved`;
    renameSync(folder, moved);
    const reattached = attachFolder({ workspaceId, path: moved });
    expect(reattached.folder.id).toBe(folderId);
    const resolved = resolveAsset({
      workspaceId,
      folderId: reattached.folder.id,
      mediaId: registered.mediaId,
    });
    expect(resolved.relativePath).toBe("Images/accent.png");
    expect(readFileSync(resolved.path)).toEqual(original);
  });

  it("reports missing media without dropping the catalog entry", () => {
    const { workspaceId, folderId, folder } = attachedFolder();
    const source = placeFixture(folder);
    const registered = registerAsset({ workspaceId, folderId, path: source });
    unlinkSync(source);
    expect(() => resolveAsset({ workspaceId, folderId, mediaId: registered.mediaId })).toThrow(
      CoreError,
    );
    expect(() => resolveAsset({ workspaceId, folderId, mediaId: registered.mediaId })).toThrow(
      registered.mediaId,
    );
    expect(() => resolveAsset({ workspaceId, folderId, mediaId: registered.mediaId })).toThrow(
      source,
    );
    const opened = openFolderDocument({ workspaceId, folderId });
    expect(opened.assets.items[registered.mediaId]).toEqual({ relativePath: "Images/accent.png" });
    expect(opened.project.mediaLibrary.items.some((item) => item.id === registered.mediaId)).toBe(
      true,
    );
  });

  it("does not resolve another folder's similarly named file", () => {
    const { workspaceId, folderId, folder } = attachedFolder();
    const other = mkdtempSync(join(tmpdir(), "inpainter-assets-folder-b-"));
    const second = attachFolder({ workspaceId, path: other });
    const firstFile = placeFixture(folder);
    mkdirSync(join(other, "Images"), { recursive: true });
    writeFileSync(join(other, "Images", "accent.png"), "other-bytes");
    const first = registerAsset({ workspaceId, folderId, path: firstFile });
    const otherAsset = registerAsset({
      workspaceId,
      folderId: second.folder.id,
      path: join(other, "Images", "accent.png"),
    });
    const resolved = resolveAsset({ workspaceId, folderId, mediaId: first.mediaId });
    expect(readFileSync(resolved.path)).toEqual(readFileSync(fixtureImage));
    expect(readFileSync(resolved.path).toString()).not.toBe("other-bytes");
    expect(otherAsset.mediaId).not.toBe(first.mediaId);
    expect(
      resolveAsset({ workspaceId, folderId: second.folder.id, mediaId: otherAsset.mediaId }).path,
    ).toBe(join(other, "Images", "accent.png"));
  });

  it("copies an external file only when copyTo is provided", () => {
    const { workspaceId, folderId, folder } = attachedFolder();
    const external = join(mkdtempSync(join(tmpdir(), "inpainter-assets-external-")), "accent.png");
    cpSync(fixtureImage, external);
    expect(() => registerAsset({ workspaceId, folderId, path: external })).toThrow(/copyTo is required/);
    expect(existsSync(join(folder, "Images", "accent.png"))).toBe(false);
    expect(readFileSync(external)).toEqual(readFileSync(fixtureImage));

    const registered = registerAsset({
      workspaceId,
      folderId,
      path: external,
      copyTo: "Images/accent.png",
    });
    expect(registered.relativePath).toBe("Images/accent.png");
    expect(existsSync(join(folder, "Images", "accent.png"))).toBe(true);
    expect(readFileSync(join(folder, "Images", "accent.png"))).toEqual(readFileSync(fixtureImage));
    expect(readFileSync(external)).toEqual(readFileSync(fixtureImage));
  });

  it("refuses locators that escape the production folder", () => {
    const { workspaceId, folderId, folder } = attachedFolder();
    const external = join(mkdtempSync(join(tmpdir(), "inpainter-assets-escape-")), "accent.png");
    cpSync(fixtureImage, external);

    expect(() =>
      registerAsset({ workspaceId, folderId, path: external, copyTo: "../escape.png" }),
    ).toThrow(/folder-relative|escapes/);
    expect(() =>
      registerAsset({ workspaceId, folderId, path: external, copyTo: external }),
    ).toThrow(/folder-relative|escapes/);

    mkdirSync(join(folder, "Images"), { recursive: true });
    const link = join(folder, "Images", "linked.png");
    symlinkSync(external, link);
    expect(() => registerAsset({ workspaceId, folderId, path: link })).toThrow(/escapes/);

    const opened = openFolderDocument({ workspaceId, folderId });
    expect(opened.assets.items).toEqual({});
    expect(opened.project.mediaLibrary.items).toEqual([]);
    expect(existsSync(join(folder, "escape.png"))).toBe(false);
  });

  it("does not copy through a parent symlink that points outside the folder", () => {
    const { workspaceId, folderId, folder } = attachedFolder();
    const external = join(mkdtempSync(join(tmpdir(), "inpainter-assets-src-")), "accent.png");
    cpSync(fixtureImage, external);
    const outside = mkdtempSync(join(tmpdir(), "inpainter-assets-outside-"));
    symlinkSync(outside, join(folder, "Images"));
    expect(() =>
      registerAsset({ workspaceId, folderId, path: external, copyTo: "Images/accent.png" }),
    ).toThrow(/escapes/);
    expect(existsSync(join(outside, "accent.png"))).toBe(false);
    expect(openFolderDocument({ workspaceId, folderId }).assets.items).toEqual({});
  });
});
