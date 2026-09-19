import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { renderDocumentFrame, renderDocumentFrames } from "../src/operations/renderFrame.ts";
import { projectFromJson, projectToJson } from "../src/production/serializer.ts";
import type { ProductionDocument } from "../src/production/types.ts";
import { tryResolveElectronBinary } from "../src/render/host/spawn.ts";
import {
  REFERENCE_SAMPLES,
  fixtureDir,
  loadReferenceManifest,
  referenceDir,
  sha256Bytes,
} from "./helpers/capture-motion-scene-reference.ts";
import { compareRgba, cornerAlpha, decodePng } from "./helpers/png-compare.ts";

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/production/motion-scene/project.oreel",
);

const hasElectron = Boolean(await tryResolveElectronBinary());

function decodeResult(pngBase64: string) {
  return decodePng(Buffer.from(pngBase64, "base64"));
}

function goldenInstance(label: string) {
  const manifest = loadReferenceManifest();
  const sample = manifest.samples.find((entry) => entry.label === label);
  if (!sample) throw new Error(`Missing golden ${label}`);
  return decodePng(readFileSync(join(referenceDir(), sample.instance.path)));
}

function goldenComposition(label: string) {
  const manifest = loadReferenceManifest();
  const sample = manifest.samples.find((entry) => entry.label === label);
  if (!sample) throw new Error(`Missing golden ${label}`);
  return decodePng(readFileSync(join(referenceDir(), sample.composition.path)));
}

function writeTempDocument(mutate: (project: ProductionDocument) => void): string {
  const dest = mkdtempSync(join(tmpdir(), "inpainter-motion-instance-"));
  mkdirSync(dest, { recursive: true });
  cpSync(join(fixtureDir(), "project.oreel"), join(dest, "project.oreel"));
  cpSync(join(fixtureDir(), "project.assets.json"), join(dest, "project.assets.json"));
  const file = join(dest, "project.oreel");
  const project = projectFromJson(readFileSync(file, "utf8"));
  mutate(project);
  writeFileSync(file, projectToJson(project));
  return file;
}

describe("motion scene instance blit", () => {
  it("keeps the tracked fixture bytes unchanged", () => {
    const manifest = loadReferenceManifest();
    expect(sha256Bytes(readFileSync(fixturePath))).toBe(manifest.fixture.project.sha256);
  });

  it("rejects unsupported timeline content on the instance path", async () => {
    const extraMedia = writeTempDocument((project) => {
      project.mediaLibrary.items.push({ id: "clip-a" });
    });
    await expect(
      renderDocumentFrame({ path: extraMedia, time: 2, source: "instance" }),
    ).rejects.toBeInstanceOf(CoreError);

    const extraTrack = writeTempDocument((project) => {
      project.timeline.tracks.push({
        id: "track-extra",
        clips: [{ id: "clip-extra", startTime: 0, duration: 1 }],
      });
    });
    await expect(
      renderDocumentFrame({ path: extraTrack, time: 2, source: "instance" }),
    ).rejects.toThrow(/Unsupported motion content/);
  });

  it.skipIf(!hasElectron)(
    "matches every instance golden and stays opaque-black at the interval edges",
    { timeout: 90_000 },
    async () => {
      const manifest = loadReferenceManifest();
      const times = REFERENCE_SAMPLES.map((sample) => sample.time);
      const frames = await renderDocumentFrames({
        path: fixturePath,
        times,
        source: "instance",
      });
      expect(frames).toHaveLength(times.length);
      for (const [index, sample] of REFERENCE_SAMPLES.entries()) {
        const actual = decodeResult(frames[index].pngBase64);
        const expected = goldenInstance(sample.label);
        const diff = compareRgba(actual, expected);
        expect(diff.maxAbs, sample.label).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);
        expect(diff.opaqueFromZero).toBe(0);
      }

      const start = decodeResult(frames[0].pngBase64);
      const end = decodeResult(frames[times.length - 1].pngBase64);
      expect(cornerAlpha(start)).toEqual([255, 255, 255, 255]);
      expect(cornerAlpha(end)).toEqual([255, 255, 255, 255]);
      expect(compareRgba(start, end).maxAbs).toBeLessThanOrEqual(manifest.tolerances.sameEngine.maxAbs);

      const mid = decodeResult(frames[4].pngBase64);
      expect(compareRgba(mid, goldenComposition("t-2s")).maxAbs).toBeGreaterThan(0);
      expect(sha256Bytes(readFileSync(fixturePath))).toBe(manifest.fixture.project.sha256);
    },
  );

  it.skipIf(!hasElectron)(
    "maps a shifted instance through local time and skips hidden tracks",
    { timeout: 90_000 },
    async () => {
      const manifest = loadReferenceManifest();
      const shifted = writeTempDocument((project) => {
        (project.motionInstances[0] as { startTime: number }).startTime = 2;
        const clip = project.timeline.tracks[0]?.clips[0];
        if (clip) clip.startTime = 2;
      });
      const frames = await renderDocumentFrames({
        path: shifted,
        times: [0, 1.9, 2, 4],
        source: "instance",
      });
      expect(compareRgba(decodeResult(frames[0].pngBase64), goldenInstance("t-0s")).maxAbs).toBeLessThanOrEqual(
        manifest.tolerances.port.maxAbs,
      );
      expect(compareRgba(decodeResult(frames[1].pngBase64), goldenInstance("t-5s")).maxAbs).toBeLessThanOrEqual(
        manifest.tolerances.port.maxAbs,
      );
      expect(compareRgba(decodeResult(frames[2].pngBase64), goldenInstance("t-0s")).maxAbs).toBeLessThanOrEqual(
        manifest.tolerances.port.maxAbs,
      );
      expect(compareRgba(decodeResult(frames[3].pngBase64), goldenInstance("t-2s")).maxAbs).toBeLessThanOrEqual(
        manifest.tolerances.port.maxAbs,
      );

      const hidden = writeTempDocument((project) => {
        (project.timeline.tracks[0] as { hidden?: boolean }).hidden = true;
      });
      const hiddenFrame = await renderDocumentFrame({ path: hidden, time: 2, source: "instance" });
      expect(
        compareRgba(decodeResult(hiddenFrame.pngBase64), goldenInstance("t-0s")).maxAbs,
      ).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);

      expect(sha256Bytes(readFileSync(fixturePath))).toBe(manifest.fixture.project.sha256);
    },
  );
});
