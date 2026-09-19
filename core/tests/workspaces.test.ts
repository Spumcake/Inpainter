import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { homeInit } from "../src/operations/home.ts";
import {
  addWorkspace,
  createWorkspace,
  listWorkspaces,
  removeWorkspace,
} from "../src/operations/workspaces.ts";
import { MANIFEST_RELATIVE_PATH, writeManifest } from "../src/operations/workspaceManifest.ts";
import { launcherRegistryPath } from "../src/paths.ts";

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
  const home = mkdtempSync(join(tmpdir(), "inpainter-workspaces-"));
  process.env.INPAINTER_HOME = home;
  delete process.env.INPAINTER_SKILLS_DIR;
  cpSync(repoBootstrap, join(home, "bootstrap"), { recursive: true });
  return home;
}

describe("workspace operations", () => {
  it("creates a workspace folder, seeds defaults, and registers it", () => {
    isolatedHome();
    homeInit();
    const location = mkdtempSync(join(tmpdir(), "inpainter-create-"));
    const created = createWorkspace({ name: "Test Workspace", location });
    const dest = join(location, "test-workspace");
    expect(created.path).toBe(dest);
    expect(created.name).toBe("Test Workspace");
    const manifest = JSON.parse(readFileSync(join(dest, MANIFEST_RELATIVE_PATH), "utf8")) as {
      id: string;
      name: string;
      slug: string;
    };
    expect(manifest.name).toBe("Test Workspace");
    expect(manifest.slug).toBe("test-workspace");
    expect(manifest.id).toBe(created.id);
    expect(existsSync(join(dest, ".inpainter", "tools", "canvas.tool.json"))).toBe(true);
    expect(existsSync(join(dest, ".inpainter", "skills"))).toBe(true);
    expect(existsSync(join(dest, "structure.json"))).toBe(false);
    expect(existsSync(join(dest, ".inpainter", "structure.json"))).toBe(false);
    expect(readdirSync(dest)).toEqual([".inpainter"]);
    const listed = listWorkspaces().workspaces;
    expect(listed[0]).toMatchObject({ id: "local", name: "Local" });
    expect(listed.some((workspace) => workspace.id === created.id)).toBe(true);
  });

  it("does not overwrite existing workspace files when adding a folder", () => {
    isolatedHome();
    homeInit();
    const folder = mkdtempSync(join(tmpdir(), "inpainter-add-"));
    mkdirSync(join(folder, ".inpainter", "tools"), { recursive: true });
    writeFileSync(join(folder, ".inpainter", "tools", "canvas.tool.json"), "custom");
    writeFileSync(join(folder, "clip.mp4"), "keep");
    const added = addWorkspace({ path: folder });
    expect(added.name).toBe(folder.split(/[\\/]/u).at(-1));
    expect(readFileSync(join(folder, ".inpainter", "tools", "canvas.tool.json"), "utf8")).toBe(
      "custom",
    );
    expect(readFileSync(join(folder, "clip.mp4"), "utf8")).toBe("keep");
    expect(existsSync(join(folder, ".inpainter", "tools", "editor.tool.json"))).toBe(true);
  });

  it("reuses an existing manifest when adding a folder", () => {
    isolatedHome();
    homeInit();
    const folder = mkdtempSync(join(tmpdir(), "inpainter-existing-"));
    writeManifest(folder, {
      id: "keep-id",
      name: "Existing",
      slug: "existing",
      created: "2026-01-01T00:00:00.000Z",
      modified: "2026-01-01T00:00:00.000Z",
      inpainter: "pre-alpha",
    });
    const added = addWorkspace({ path: folder });
    expect(added.id).toBe("keep-id");
    expect(added.name).toBe("Existing");
  });

  it("rejects adding a folder with a malformed manifest", () => {
    isolatedHome();
    homeInit();
    const folder = mkdtempSync(join(tmpdir(), "inpainter-bad-"));
    mkdirSync(join(folder, ".inpainter"), { recursive: true });
    writeFileSync(join(folder, MANIFEST_RELATIVE_PATH), "invalid json");
    expect(() => addWorkspace({ path: folder })).toThrow(CoreError);
  });

  it("rejects duplicate paths and identities", () => {
    isolatedHome();
    homeInit();
    const location = mkdtempSync(join(tmpdir(), "inpainter-dup-"));
    const first = createWorkspace({ name: "One", location });
    expect(() => addWorkspace({ path: first.path })).toThrow(/already a workspace tab/);
    const copy = mkdtempSync(join(tmpdir(), "inpainter-copy-"));
    writeManifest(copy, {
      id: first.id,
      name: "Copy",
      slug: "copy",
      created: "2026-01-01T00:00:00.000Z",
      modified: "2026-01-01T00:00:00.000Z",
      inpainter: "pre-alpha",
    });
    expect(() => addWorkspace({ path: copy })).toThrow(/already in the launcher/);
  });

  it("keeps a cached registry entry when the folder is missing", () => {
    isolatedHome();
    homeInit();
    writeFileSync(
      launcherRegistryPath(),
      JSON.stringify({
        workspaces: [
          { id: "cached-id", name: "Cached Name", path: "/definitely/missing/workspace" },
        ],
      }),
    );
    const listed = listWorkspaces().workspaces;
    expect(listed).toEqual(
      expect.arrayContaining([
        { id: "cached-id", name: "Cached Name", path: "/definitely/missing/workspace" },
      ]),
    );
  });

  it("refreshes a listed workspace from its live manifest", () => {
    isolatedHome();
    homeInit();
    const location = mkdtempSync(join(tmpdir(), "inpainter-refresh-"));
    const created = createWorkspace({ name: "Stale", location });
    const manifest = JSON.parse(readFileSync(join(created.path, MANIFEST_RELATIVE_PATH), "utf8")) as {
      id: string;
      name: string;
      slug: string;
      created: string;
      modified: string;
      inpainter: string;
    };
    writeFileSync(
      join(created.path, MANIFEST_RELATIVE_PATH),
      `${JSON.stringify({ ...manifest, id: "live-id", name: "Live Name" }, null, 2)}\n`,
    );
    const listed = listWorkspaces().workspaces.find((workspace) => workspace.path === created.path);
    expect(listed).toMatchObject({ id: "live-id", name: "Live Name" });
    const registry = JSON.parse(readFileSync(launcherRegistryPath(), "utf8")) as {
      workspaces: Array<{ id: string; name: string }>;
    };
    expect(registry.workspaces).toEqual(
      expect.arrayContaining([{ id: "live-id", name: "Live Name", path: created.path }]),
    );
  });

  it("refuses to add or remove the Local workspace", () => {
    const home = isolatedHome();
    homeInit();
    expect(() => addWorkspace({ path: join(home, "workspaces", "Local") })).toThrow(
      /already the Local workspace/,
    );
    expect(() => removeWorkspace({ id: "local" })).toThrow(/cannot be removed/);
  });

  it("unregisters a workspace without deleting its folder", () => {
    isolatedHome();
    homeInit();
    const location = mkdtempSync(join(tmpdir(), "inpainter-remove-"));
    const created = createWorkspace({ name: "Remove Me", location });
    expect(removeWorkspace({ id: created.id })).toEqual({ removed: true });
    expect(existsSync(join(created.path, MANIFEST_RELATIVE_PATH))).toBe(true);
    expect(listWorkspaces().workspaces.some((workspace) => workspace.id === created.id)).toBe(false);
    expect(() => removeWorkspace({ id: created.id })).toThrow(/not in the launcher/);
  });

  it("does not create a workspace folder when the registry is malformed", () => {
    isolatedHome();
    homeInit();
    const location = mkdtempSync(join(tmpdir(), "inpainter-bad-registry-"));
    writeFileSync(launcherRegistryPath(), "not-json");
    expect(() => createWorkspace({ name: "Broken Create", location })).toThrow(CoreError);
    expect(existsSync(join(location, "broken-create"))).toBe(false);
    writeFileSync(launcherRegistryPath(), `${JSON.stringify({ workspaces: [] }, null, 2)}\n`);
    const created = createWorkspace({ name: "Broken Create", location });
    expect(created.path).toBe(join(location, "broken-create"));
    expect(existsSync(join(created.path, MANIFEST_RELATIVE_PATH))).toBe(true);
  });

  it("rolls back a destination created before registration fails", () => {
    isolatedHome();
    homeInit();
    const location = mkdtempSync(join(tmpdir(), "inpainter-readonly-registry-"));
    const dest = join(location, "rolled-back");
    chmodSync(launcherRegistryPath(), 0o444);
    try {
      expect(() => createWorkspace({ name: "Rolled Back", location })).toThrow();
      expect(existsSync(dest)).toBe(false);
    } finally {
      chmodSync(launcherRegistryPath(), 0o644);
    }
  });

  it("exposes the same create and list results through the core command", () => {
    const home = isolatedHome();
    homeInit();
    const location = mkdtempSync(join(tmpdir(), "inpainter-cli-"));
    const created = spawnSync(
      tsx,
      [cli, "workspace", "create", "--name", "CLI Workspace", "--location", location],
      { env: { ...process.env, INPAINTER_HOME: home }, encoding: "utf8" },
    );
    expect(created.status).toBe(0);
    const record = JSON.parse(created.stdout) as { id: string; name: string; path: string };
    expect(record.name).toBe("CLI Workspace");
    const listed = spawnSync(tsx, [cli, "workspace", "list"], {
      env: { ...process.env, INPAINTER_HOME: home },
      encoding: "utf8",
    });
    expect(listed.status).toBe(0);
    const payload = JSON.parse(listed.stdout) as { workspaces: Array<{ id: string }> };
    expect(payload.workspaces.some((workspace) => workspace.id === record.id)).toBe(true);
  });
});
