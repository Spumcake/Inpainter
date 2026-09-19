import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { createDocument, openDocument, saveDocument } from "../src/operations/documents.ts";
import { commitToJson } from "../src/production/commit.ts";
import { SCHEMA_VERSION, assetIndexToJson, projectToJson } from "../src/production/serializer.ts";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/production");
const tsx = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/.bin/tsx");
const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../src/cli.ts");

function copyFixture(name: "motion-scene" | "empty-document"): string {
  const dest = mkdtempSync(join(tmpdir(), `inpainter-document-${name}-`));
  cpSync(join(fixtures, name), dest, { recursive: true });
  return dest;
}

function runCli(args: string[], stdin?: string): { stdout: string; status: number; stderr: string } {
  const result = spawnSync(tsx, [cli, ...args], {
    encoding: "utf8",
    input: stdin,
  });
  return { stdout: result.stdout, status: result.status ?? 1, stderr: result.stderr };
}

function parseCli(args: string[], stdin?: string): Record<string, unknown> {
  const result = runCli(args, stdin);
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe("document operations", () => {
  it("creates an empty document, then opens it from a fresh CLI process", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-create-"));
    const created = createDocument({ path: dest, name: "Empty Document" });
    expect(created.version).toBe(SCHEMA_VERSION);
    expect(created.name).toBe("Empty Document");
    expect(created.revision).toBe(1);
    expect(created.settings).toEqual({
      width: 1920,
      height: 1080,
      frameRate: 30,
      sampleRate: 48000,
      channels: 2,
    });
    expect(created.project.timeline.tracks).toEqual([]);
    expect(created.project.motionCompositions).toEqual([]);
    expect(existsSync(join(dest, "project.oreel"))).toBe(true);
    expect(existsSync(join(dest, "project.assets.json"))).toBe(true);

    const opened = parseCli(["document", "open", "--path", dest]);
    expect(opened.id).toBe(created.id);
    expect(opened.name).toBe("Empty Document");
    expect(opened.version).toBe(SCHEMA_VERSION);
    expect(opened.settings).toEqual(created.settings);
    const project = opened.project as Record<string, unknown>;
    expect(project.motionCompositions).toEqual([]);
    expect(project.motionInstances).toEqual([]);
    expect(project.textClips).toEqual([]);
    expect((project.timeline as { tracks: unknown[] }).tracks).toEqual([]);
  });

  it("refuses to create over an existing document", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-exists-"));
    createDocument({ path: dest, name: "First" });
    expect(() => createDocument({ path: dest, name: "Second" })).toThrow(CoreError);
    expect(() => createDocument({ path: dest, name: "Second" })).toThrow(/already exists/);
  });

  it("refuses invalid JSON missing project.id and a missing envelope", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-invalid-"));
    writeFileSync(
      join(dest, "project.oreel"),
      JSON.stringify({
        version: SCHEMA_VERSION,
        project: {
          name: "Broken",
          createdAt: 1,
          modifiedAt: 1,
          settings: {
            width: 1920,
            height: 1080,
            frameRate: 30,
            sampleRate: 48000,
            channels: 2,
          },
          mediaLibrary: { items: [] },
          timeline: { tracks: [], subtitles: [], duration: 0, markers: [] },
        },
      }),
    );
    expect(() => openDocument({ path: dest })).toThrow(/missing project.id/);

    const missing = mkdtempSync(join(tmpdir(), "inpainter-document-envelope-"));
    writeFileSync(join(missing, "project.oreel"), JSON.stringify({ version: SCHEMA_VERSION }));
    expect(() => openDocument({ path: missing })).toThrow(/missing project field/);
  });

  it("opens and resaves Motion Scene without stripping authored fields", () => {
    const dest = copyFixture("motion-scene");
    const original = JSON.parse(readFileSync(join(dest, "project.oreel"), "utf8")) as {
      project: Record<string, unknown>;
    };
    const opened = openDocument({ path: dest });
    const saved = saveDocument({ path: dest, payload: opened, expectedRevision: opened.revision });
    const reopened = openDocument({ path: dest });

    const before = original.project;
    const after = reopened.project as unknown as Record<string, unknown>;
    expect(reopened.id).toBe(opened.id);
    expect(saved.id).toBe(opened.id);
    expect(after.name).toBe("OpenReel Motion Scene");
    expect(after.motionCompositions).toEqual(before.motionCompositions);
    expect(after.motionInstances).toEqual(before.motionInstances);

    const compositions = after.motionCompositions as Array<Record<string, unknown>>;
    const layers = compositions[0].layers as Array<Record<string, unknown>>;
    expect(layers).toHaveLength(2);
    expect(layers[0].name).toBe("Accent Bar");
    const originalLayers = (before.motionCompositions as Array<Record<string, unknown>>)[0]
      .layers as Array<Record<string, unknown>>;
    expect(layers[0].keyframes).toEqual(originalLayers[0].keyframes);
    const headline = layers.find((layer) => layer.name === "Headline") as Record<string, unknown>;
    expect(Array.isArray(headline.keyframes)).toBe(true);
    expect((headline.keyframes as unknown[]).length).toBe(4);
    expect(headline.textAnimators).toEqual(originalLayers[1].textAnimators);

    const tracks = (after.timeline as { tracks: Array<Record<string, unknown>> }).tracks;
    const clip = (tracks[0].clips as Array<Record<string, unknown>>)[0];
    expect(String(clip.mediaId).startsWith("motion-")).toBe(true);
    expect(clip.metadata).toEqual(
      ((before.timeline as { tracks: Array<{ clips: Array<Record<string, unknown>> }> }).tracks[0]
        .clips[0] as Record<string, unknown>).metadata,
    );
  });

  it("round-trips Motion Scene through a fresh CLI process", () => {
    const dest = copyFixture("motion-scene");
    const opened = parseCli(["document", "open", "--path", dest]);
    const saved = parseCli(
      ["document", "save", "--path", dest, "--expected-revision", String(opened.revision)],
      JSON.stringify(opened),
    );
    expect(saved.id).toBe(opened.id);
    const reopened = parseCli(["document", "open", "--path", dest]);
    const before = (opened.project as Record<string, unknown>).motionCompositions;
    const after = (reopened.project as Record<string, unknown>).motionCompositions;
    expect(after).toEqual(before);
  });
});

describe("recoverable document persistence", () => {
  it("increments revision on save and retains project.id", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-revision-"));
    const created = createDocument({ path: dest, name: "Keep Id" });
    expect(created.revision).toBe(1);
    const saved = saveDocument({ path: dest, payload: created, expectedRevision: created.revision });
    expect(saved.id).toBe(created.id);
    expect(saved.revision).toBe(2);
    expect(saved.project.id).toBe(created.project.id);
    const commit = JSON.parse(readFileSync(join(dest, "project.commit.json"), "utf8")) as {
      revision: number;
      documentId: string;
    };
    expect(commit.revision).toBe(2);
    expect(commit.documentId).toBe(created.id);
    const reopened = openDocument({ path: dest });
    expect(reopened.revision).toBe(2);
    expect(reopened.id).toBe(created.id);
  });

  it("recovers the previous complete version when save fails after the document stage", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-fail-doc-"));
    const created = createDocument({ path: dest, name: "Original" });
    const mutated = {
      ...created,
      project: { ...created.project, name: "Mutated" },
      assets: { schemaVersion: 1 as const, items: { clip: { relativePath: "clip.mp4" } } },
    };
    expect(() =>
      saveDocument({ path: dest, payload: mutated, expectedRevision: created.revision, failAfter: "document" }),
    ).toThrow(
      /injected failure after document stage/,
    );
    const opened = openDocument({ path: dest });
    expect(opened.id).toBe(created.id);
    expect(opened.name).toBe("Original");
    expect(opened.revision).toBe(1);
    expect(opened.assets).toEqual({ schemaVersion: 1, items: {} });
    expect(existsSync(join(dest, "project.oreel"))).toBe(true);
  });

  it("recovers the previous complete version when save fails after the index stage", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-fail-index-"));
    const created = createDocument({ path: dest, name: "Original" });
    const mutated = {
      ...created,
      project: { ...created.project, name: "Mutated" },
      assets: { schemaVersion: 1 as const, items: { clip: { relativePath: "clip.mp4" } } },
    };
    expect(() =>
      saveDocument({ path: dest, payload: mutated, expectedRevision: created.revision, failAfter: "index" }),
    ).toThrow(
      /injected failure after index stage/,
    );
    const opened = openDocument({ path: dest });
    expect(opened.id).toBe(created.id);
    expect(opened.name).toBe("Original");
    expect(opened.revision).toBe(1);
    expect(opened.assets).toEqual({ schemaVersion: 1, items: {} });
  });

  it("does not create a default document when first create fails after the document stage", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-fail-create-"));
    expect(() => createDocument({ path: dest, name: "Unfinished", failAfter: "document" })).toThrow(
      /injected failure after document stage/,
    );
    expect(existsSync(join(dest, "project.oreel"))).toBe(false);
    expect(existsSync(join(dest, "project.commit.json"))).toBe(false);
    expect(() => openDocument({ path: dest })).toThrow(CoreError);
    expect(() => openDocument({ path: dest })).toThrow(/incomplete save|not found/i);
    expect(existsSync(join(dest, "project.oreel"))).toBe(false);
    expect(existsSync(join(dest, "project.assets.json"))).toBe(false);
  });

  it("fails open on a corrupt asset index when the document references media", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-bad-index-"));
    createDocument({ path: dest, name: "With Media" });
    const documentPath = join(dest, "project.oreel");
    const envelope = JSON.parse(readFileSync(documentPath, "utf8")) as {
      version: string;
      project: Record<string, unknown> & { mediaLibrary: { items: Array<{ id: string }> } };
    };
    envelope.project.mediaLibrary.items = [{ id: "media-clip-1" }];
    const originalDocument = `${JSON.stringify(envelope, null, 2)}\n`;
    writeFileSync(documentPath, originalDocument);
    const indexPath = join(dest, "project.assets.json");
    const garbage = "{not-json";
    writeFileSync(indexPath, garbage);
    expect(() => openDocument({ path: dest })).toThrow(CoreError);
    expect(() => openDocument({ path: dest })).toThrow(indexPath);
    expect(readFileSync(indexPath, "utf8")).toBe(garbage);
    expect(readFileSync(documentPath, "utf8")).toBe(originalDocument);
  });

  it("fails open on a corrupt commit record and leaves the file unchanged", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-bad-commit-"));
    createDocument({ path: dest, name: "Committed" });
    const commitPath = join(dest, "project.commit.json");
    const garbage = "{not-a-commit";
    writeFileSync(commitPath, garbage);
    expect(() => openDocument({ path: dest })).toThrow(CoreError);
    expect(() => openDocument({ path: dest })).toThrow(commitPath);
    expect(readFileSync(commitPath, "utf8")).toBe(garbage);
  });

  it("opens a Motion Scene fixture without a commit, then writes a commit on save", () => {
    const dest = copyFixture("motion-scene");
    expect(existsSync(join(dest, "project.commit.json"))).toBe(false);
    const opened = openDocument({ path: dest });
    expect(opened.revision).toBe(1);
    const saved = saveDocument({ path: dest, payload: opened, expectedRevision: opened.revision });
    expect(saved.revision).toBe(2);
    expect(saved.id).toBe(opened.id);
    expect(existsSync(join(dest, "project.commit.json"))).toBe(true);
    const commit = JSON.parse(readFileSync(join(dest, "project.commit.json"), "utf8")) as {
      revision: number;
      documentId: string;
    };
    expect(commit.revision).toBe(2);
    expect(commit.documentId).toBe(opened.id);
    const reopened = openDocument({ path: dest });
    expect(reopened.id).toBe(opened.id);
    expect(reopened.project.motionCompositions).toEqual(opened.project.motionCompositions);
    const layers = (reopened.project.motionCompositions as Array<{ layers: unknown[] }>)[0].layers;
    expect(layers).toHaveLength(2);
  });

  it("finishes promoting a staged pair when the commit is already published", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-promote-"));
    const created = createDocument({ path: dest, name: "Original" });
    const stagedProject = { ...created.project, name: "Promoted" };
    writeFileSync(join(dest, "project.oreel.stage"), projectToJson(stagedProject));
    writeFileSync(join(dest, "project.assets.json.stage"), assetIndexToJson(created.assets));
    writeFileSync(
      join(dest, "project.commit.json"),
      commitToJson({
        schemaVersion: 1,
        revision: 2,
        documentId: created.id,
        document: "project.oreel",
        assets: "project.assets.json",
      }),
    );
    const opened = openDocument({ path: dest });
    expect(opened.name).toBe("Promoted");
    expect(opened.revision).toBe(2);
    expect(opened.id).toBe(created.id);
    expect(existsSync(join(dest, "project.oreel.stage"))).toBe(false);
    expect(existsSync(join(dest, "project.assets.json.stage"))).toBe(false);
  });

  it("finishes promoting a leftover asset index after a crash mid-promote", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-partial-promote-"));
    const created = createDocument({ path: dest, name: "Original" });
    const mutated = {
      ...created,
      project: {
        ...created.project,
        name: "With Media",
        mediaLibrary: { ...created.project.mediaLibrary, items: [{ id: "media-clip-1" }] },
      },
      assets: { schemaVersion: 1 as const, items: { "media-clip-1": { relativePath: "Images/clip.mp4" } } },
    };
    expect(() =>
      saveDocument({
        path: dest,
        payload: mutated,
        expectedRevision: created.revision,
        failAfter: "promote-document",
      }),
    ).toThrow(/injected failure after document promote/);
    expect(existsSync(join(dest, "project.assets.json.stage"))).toBe(true);
    const opened = openDocument({ path: dest });
    expect(opened.revision).toBe(2);
    expect(opened.name).toBe("With Media");
    expect(opened.assets.items["media-clip-1"]).toEqual({ relativePath: "Images/clip.mp4" });
    expect(existsSync(join(dest, "project.assets.json.stage"))).toBe(false);
  });

  it("requires expectedRevision and preserves document id on save", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-document-save-contract-"));
    const created = createDocument({ path: dest, name: "Keep" });
    expect(() => saveDocument({ path: dest, payload: created })).toThrow(/expectedRevision is required/);
    const renamed = { ...created, project: { ...created.project, id: "other-id", name: "Hijacked" } };
    expect(() => saveDocument({ path: dest, payload: renamed, expectedRevision: created.revision })).toThrow(
      /Document id cannot change/,
    );
    expect(openDocument({ path: dest }).id).toBe(created.id);
    expect(openDocument({ path: dest }).name).toBe("Keep");
    const stale = { ...created, project: { ...created.project, name: "Stale" } };
    expect(() => saveDocument({ path: dest, payload: stale, expectedRevision: 99 })).toThrow(/Save conflict/);
    expect(openDocument({ path: dest }).name).toBe("Keep");
  });

  it("round-trips envelope minimumReaderVersion and capabilities", () => {
    const dest = copyFixture("motion-scene");
    const envelopePath = join(dest, "project.oreel");
    const envelope = JSON.parse(readFileSync(envelopePath, "utf8")) as Record<string, unknown>;
    envelope.minimumReaderVersion = "1.0.0";
    envelope.capabilities = { motion: true };
    writeFileSync(envelopePath, `${JSON.stringify(envelope, null, 2)}\n`);
    const opened = openDocument({ path: dest });
    expect(opened.project.minimumReaderVersion).toBe("1.0.0");
    expect(opened.project.capabilities).toEqual({ motion: true });
    saveDocument({ path: dest, payload: opened, expectedRevision: opened.revision });
    const savedEnvelope = JSON.parse(readFileSync(envelopePath, "utf8")) as {
      minimumReaderVersion?: string;
      capabilities?: unknown;
      project: { motionCompositions: unknown };
    };
    expect(savedEnvelope.minimumReaderVersion).toBe("1.0.0");
    expect(savedEnvelope.capabilities).toEqual({ motion: true });
    expect(savedEnvelope.project.motionCompositions).toEqual(opened.project.motionCompositions);
  });
});
