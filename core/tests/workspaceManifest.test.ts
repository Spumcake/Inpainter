import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import {
  MANIFEST_RELATIVE_PATH,
  WORKSPACE_INPAINTER,
  ensureManifest,
  readManifest,
  seedDefaults,
  slugify,
  writeManifest,
} from "../src/operations/workspaceManifest.ts";

const originalHome = process.env.INPAINTER_HOME;
const repoBootstrap = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../installer/setup/bootstrap",
);

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.INPAINTER_HOME;
  } else {
    process.env.INPAINTER_HOME = originalHome;
  }
});

function isolatedRoot(): string {
  return mkdtempSync(join(tmpdir(), "inpainter-manifest-"));
}

function writeDefaultsHome(): string {
  const home = isolatedRoot();
  process.env.INPAINTER_HOME = home;
  mkdirSync(join(home, "bootstrap"), { recursive: true });
  cpSync(repoBootstrap, join(home, "bootstrap"), { recursive: true });
  return home;
}

describe("workspace manifest", () => {
  it("lets metadata travel with a renamed workspace folder", () => {
    const root = isolatedRoot();
    const original = join(root, "original");
    const moved = join(root, "renamed-folder");
    writeManifest(original, {
      id: "existing-registry-id",
      name: "My Production",
      slug: "my-production",
      created: "2026-01-01T00:00:00.000Z",
      modified: "2026-01-01T00:00:00.000Z",
      inpainter: WORKSPACE_INPAINTER,
    });
    renameSync(original, moved);
    const loaded = readManifest(moved);
    expect(loaded).toMatchObject({
      id: "existing-registry-id",
      slug: "my-production",
      name: "My Production",
    });
  });

  it("never overwrites existing metadata", () => {
    const root = isolatedRoot();
    writeManifest(root, {
      id: "original",
      name: "Original Name",
      slug: "original-name",
      created: "2026-01-01T00:00:00.000Z",
      modified: "2026-01-01T00:00:00.000Z",
      inpainter: WORKSPACE_INPAINTER,
    });
    expect(() =>
      writeManifest(root, {
        id: "replacement",
        name: "Replacement",
        slug: "replacement",
        created: "2026-02-01T00:00:00.000Z",
        modified: "2026-02-01T00:00:00.000Z",
        inpainter: WORKSPACE_INPAINTER,
      }),
    ).toThrow(CoreError);
    expect(readManifest(root)?.name).toBe("Original Name");
  });

  it("treats malformed and incomplete manifests as errors, not missing metadata", () => {
    const root = isolatedRoot();
    expect(readManifest(root)).toBeNull();
    mkdirSync(join(root, ".inpainter"), { recursive: true });
    for (const content of ["invalid json", '{"name":""}', '{"slug":"name"}']) {
      writeFileSync(join(root, MANIFEST_RELATIVE_PATH), content);
      expect(() => readManifest(root)).toThrow(CoreError);
    }
  });

  it("rewrites legacy manifests with a slug and current core fields", () => {
    const root = isolatedRoot();
    mkdirSync(join(root, ".inpainter"), { recursive: true });
    writeFileSync(
      join(root, MANIFEST_RELATIVE_PATH),
      '{"schema_version":1,"id":"old-id","name":"My Production"}',
    );
    const loaded = readManifest(root);
    expect(loaded?.id).toBe("old-id");
    expect(loaded?.name).toBe("My Production");
    expect(loaded?.slug).toBe(slugify(root.split(/[\\/]/u).at(-1) ?? ""));
    expect(loaded?.created).toBeTruthy();
    expect(loaded?.modified).toBeTruthy();
    expect(loaded?.inpainter).toBe(WORKSPACE_INPAINTER);
    const rewritten = JSON.parse(readFileSync(join(root, MANIFEST_RELATIVE_PATH), "utf8")) as Record<
      string,
      unknown
    >;
    expect(rewritten.id).toBe("old-id");
    expect(rewritten.name).toBe("My Production");
    expect(rewritten.slug).toBe(loaded?.slug);
    expect(rewritten.schema_version).toBeUndefined();
    expect(rewritten.inpainter).toBe(WORKSPACE_INPAINTER);
  });

  it("keeps unknown manifest fields when rewriting", () => {
    const root = isolatedRoot();
    mkdirSync(join(root, ".inpainter"), { recursive: true });
    writeFileSync(
      join(root, MANIFEST_RELATIVE_PATH),
      `{
  "id": "keep-id",
  "name": "Keep",
  "slug": "keep",
  "created": "2026-01-01T00:00:00.000Z",
  "modified": "2026-01-01T00:00:00.000Z",
  "color": "red"
}`,
    );
    const loaded = readManifest(root);
    expect(loaded?.id).toBe("keep-id");
    expect(loaded?.inpainter).toBe(WORKSPACE_INPAINTER);
    const stored = JSON.parse(readFileSync(join(root, MANIFEST_RELATIVE_PATH), "utf8")) as Record<
      string,
      unknown
    >;
    expect(stored.color).toBe("red");
    expect(stored.inpainter).toBe(WORKSPACE_INPAINTER);
  });

  it("turns display names into folder names", () => {
    expect(slugify("My Production")).toBe("my-production");
    expect(slugify("  Hello---World  ")).toBe("hello-world");
    expect(slugify("***")).toBe("workspace");
  });

  it("reuses an existing manifest and seeds defaults without overwriting files", () => {
    writeDefaultsHome();
    const root = isolatedRoot();
    mkdirSync(join(root, "notes"), { recursive: true });
    writeFileSync(join(root, "notes", "idea.txt"), "keep");
    writeManifest(root, {
      id: "keep-id",
      name: "Existing",
      slug: "existing",
      created: "2026-01-01T00:00:00.000Z",
      modified: "2026-01-01T00:00:00.000Z",
      inpainter: WORKSPACE_INPAINTER,
    });
    mkdirSync(join(root, ".inpainter", "tools"), { recursive: true });
    writeFileSync(join(root, ".inpainter", "tools", "canvas.tool.json"), "custom");
    const ensured = ensureManifest(root);
    seedDefaults(root);
    expect(ensured.id).toBe("keep-id");
    expect(ensured.name).toBe("Existing");
    expect(readFileSync(join(root, "notes", "idea.txt"), "utf8")).toBe("keep");
    expect(readFileSync(join(root, ".inpainter", "tools", "canvas.tool.json"), "utf8")).toBe("custom");
    expect(readFileSync(join(root, ".inpainter", "tools", "editor.tool.json"), "utf8")).toContain("label");
  });

  it("writes a manifest from the folder name when one is missing", () => {
    writeDefaultsHome();
    const folder = join(isolatedRoot(), "My Footage");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "clip.mp4"), "");
    const created = ensureManifest(folder);
    seedDefaults(folder);
    expect(created.name).toBe("My Footage");
    expect(created.slug).toBe("my-footage");
    expect(readManifest(folder)?.id).toBe(created.id);
    expect(readFileSync(join(folder, "clip.mp4"), "utf8")).toBe("");
    expect(readFileSync(join(folder, ".inpainter", "tools", "session.tool.json"), "utf8")).toContain(
      "label",
    );
  });

  it("rejects a malformed manifest instead of replacing it", () => {
    writeDefaultsHome();
    const root = isolatedRoot();
    mkdirSync(join(root, ".inpainter"), { recursive: true });
    writeFileSync(join(root, MANIFEST_RELATIVE_PATH), "invalid json");
    expect(() => ensureManifest(root)).toThrow(CoreError);
    expect(readFileSync(join(root, MANIFEST_RELATIVE_PATH), "utf8")).toBe("invalid json");
  });
});
