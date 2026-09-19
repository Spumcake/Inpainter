import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { renderDocumentFrames } from "../src/operations/renderFrame.ts";
import { tryResolveElectronBinary } from "../src/render/host/spawn.ts";
import { projectFromJson, projectToJson } from "../src/production/serializer.ts";
import {
  REFERENCE_SAMPLES,
  loadReferenceManifest,
  referenceDir,
} from "./helpers/capture-motion-scene-reference.ts";
import { compareRgba, cornerAlpha, decodePng } from "./helpers/png-compare.ts";

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/production/motion-scene/project.oreel",
);

const hasElectron = Boolean(await tryResolveElectronBinary());

function sampleRgba(
  decoded: ReturnType<typeof decodePng>,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * decoded.width + x) * 4;
  return [decoded.data[i], decoded.data[i + 1], decoded.data[i + 2], decoded.data[i + 3]];
}

function decodeResult(pngBase64: string) {
  return decodePng(Buffer.from(pngBase64, "base64"));
}

function goldenComposition(label: string) {
  const manifest = loadReferenceManifest();
  const sample = manifest.samples.find((entry) => entry.label === label);
  if (!sample) throw new Error(`Missing golden ${label}`);
  return decodePng(readFileSync(join(referenceDir(), sample.composition.path)));
}

describe("motion scene composition animation", () => {
  it.skipIf(!hasElectron)(
    "matches every composition golden in forward, reverse, and shuffled order",
    { timeout: 90_000 },
    async () => {
      const project = projectFromJson(readFileSync(fixturePath, "utf8"));
      const before = projectToJson(project);
      const manifest = loadReferenceManifest();
      const times = REFERENCE_SAMPLES.map((sample) => sample.time);
      const reverse = [...times].reverse();
      const shuffled = [times[3], times[0], times[6], times[1], times[7], times[4], times[2], times[5]];
      const frames = await renderDocumentFrames({
        path: fixturePath,
        times: [...times, ...reverse, ...shuffled],
      });

      expect(frames).toHaveLength(times.length * 3);
      for (const [index, sample] of REFERENCE_SAMPLES.entries()) {
        const expected = goldenComposition(sample.label);
        for (const offset of [0, times.length, times.length * 2]) {
          const actualIndex = offset === times.length * 2
            ? times.length * 2 + shuffled.indexOf(sample.time)
            : offset === times.length
              ? times.length + (times.length - 1 - index)
              : index;
          const actual = decodeResult(frames[actualIndex].pngBase64);
          const diff = compareRgba(actual, expected);
          expect(diff.maxAbs, `${sample.label} @ ${frames[actualIndex].time}`).toBeLessThanOrEqual(
            manifest.tolerances.port.maxAbs,
          );
          expect(diff.opaqueFromZero).toBe(0);
          expect(cornerAlpha(actual)).toEqual([0, 0, 0, 0]);
        }
      }

      const empty = decodeResult(frames[0].pngBase64);
      const end = decodeResult(frames[times.length - 1].pngBase64);
      expect(compareRgba(empty, goldenComposition("t-0s")).maxAbs).toBeLessThanOrEqual(
        manifest.tolerances.port.maxAbs,
      );
      expect(compareRgba(end, goldenComposition("t-5s")).maxAbs).toBeLessThanOrEqual(
        manifest.tolerances.port.maxAbs,
      );
      expect(compareRgba(empty, end).maxAbs).toBeLessThanOrEqual(manifest.tolerances.sameEngine.maxAbs);

      const fade = decodeResult(frames[5].pngBase64);
      const bar = sampleRgba(fade, 960, 702);
      expect(bar[0]).toBeGreaterThan(10);
      expect(bar[1]).toBeGreaterThan(160);
      expect(bar[2]).toBeGreaterThan(140);
      expect(bar[3]).toBe(255);
      expect(projectToJson(project)).toBe(before);
    },
  );

  it.skipIf(!hasElectron)(
    "keeps arbitrary seeks deterministic and composition-transparent",
    { timeout: 90_000 },
    async () => {
      const manifest = loadReferenceManifest();
      const frames = await renderDocumentFrames({
        path: fixturePath,
        times: [0.35, 1, 0.35],
      });
      expect(frames).toHaveLength(3);
      const first = decodeResult(frames[0].pngBase64);
      const mid = decodeResult(frames[1].pngBase64);
      const repeat = decodeResult(frames[2].pngBase64);
      expect(cornerAlpha(first)).toEqual([0, 0, 0, 0]);
      expect(cornerAlpha(mid)).toEqual([0, 0, 0, 0]);
      expect(compareRgba(first, repeat).maxAbs).toBeLessThanOrEqual(manifest.tolerances.sameEngine.maxAbs);

      const growingBar = sampleRgba(first, 960, 702);
      expect(growingBar[1]).toBeGreaterThan(80);
      expect(growingBar[3]).toBeGreaterThan(0);

      const settledBar = sampleRgba(mid, 960, 702);
      expect(settledBar[1]).toBeGreaterThan(160);
      expect(settledBar[3]).toBe(255);
    },
  );
});
