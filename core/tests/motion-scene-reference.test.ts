import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  REFERENCE_HEIGHT,
  REFERENCE_SAMPLES,
  REFERENCE_WIDTH,
  loadReferenceManifest,
  referenceDir,
  sha256Bytes,
  type ReferenceManifest,
} from "./helpers/capture-motion-scene-reference.ts";
import { compareRgba, cornerAlpha, decodePng, pngSize } from "./helpers/png-compare.ts";

const recapture = Boolean(process.env.INPAINTER_MOTION_REFERENCE);

function readPng(manifest: ReferenceManifest, rel: string) {
  return decodePng(readFileSync(join(referenceDir(), rel)));
}

describe("motion scene reference", () => {
  it("keeps 16 decoded RGBA goldens, provenance, and a transparent composition background", () => {
    const manifest = loadReferenceManifest();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.quality).toBe("preview");
    expect(manifest.width).toBe(REFERENCE_WIDTH);
    expect(manifest.height).toBe(REFERENCE_HEIGHT);
    expect(manifest.alpha).toBe("unassociated-png");
    expect(manifest.checkerboard).toBe(false);
    expect(manifest.tolerances.sameEngine.maxAbs).toBe(1);
    expect(manifest.tolerances.port.maxAbs).toBe(2);
    expect(manifest.tolerances.port.opaqueAlphaFromZeroForbidden).toBe(true);
    expect(manifest.samples).toHaveLength(REFERENCE_SAMPLES.length);

    const fixtureDir = join(referenceDir(), "..");
    expect(sha256Bytes(readFileSync(join(fixtureDir, "project.oreel")))).toBe(
      manifest.fixture.project.sha256,
    );
    expect(sha256Bytes(readFileSync(join(fixtureDir, "project.assets.json")))).toBe(
      manifest.fixture.assets.sha256,
    );

    for (const [index, expected] of REFERENCE_SAMPLES.entries()) {
      const sample = manifest.samples[index];
      expect(sample.label).toBe(expected.label);
      expect(sample.time).toBeCloseTo(expected.time, 10);
      for (const record of [sample.instance, sample.composition]) {
        const bytes = readFileSync(join(referenceDir(), record.path));
        expect(sha256Bytes(bytes)).toBe(record.sha256);
        expect(pngSize(bytes)).toEqual({ width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT });
      }
    }

    const compositionZero = readPng(manifest, manifest.samples[0].composition.path);
    expect(cornerAlpha(compositionZero)).toEqual([0, 0, 0, 0]);

    const instanceEnd = readPng(manifest, manifest.samples.at(-1)!.instance.path);
    const compositionEnd = readPng(manifest, manifest.samples.at(-1)!.composition.path);
    const endDiff = compareRgba(instanceEnd, compositionEnd);
    expect(endDiff.maxAbs).toBeGreaterThan(0);
  });

  it.skipIf(!recapture)(
    "re-renders instance and composition frames within the same-engine tolerance",
    { timeout: 240_000 },
    async () => {
      const { captureMotionSceneReference } = await import(
        "./helpers/capture-motion-scene-reference.ts"
      );
      const { mkdtempSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const outDir = mkdtempSync(join(tmpdir(), "inpainter-motion-scene-recapture-"));
      const recaptured = await captureMotionSceneReference({ outDir });
      const golden = loadReferenceManifest();
      expect(recaptured.samples).toHaveLength(golden.samples.length);
      for (const [index, sample] of golden.samples.entries()) {
        for (const path of ["instance", "composition"] as const) {
          const actual = decodePng(readFileSync(join(outDir, recaptured.samples[index][path].path)));
          const expected = decodePng(readFileSync(join(referenceDir(), sample[path].path)));
          const diff = compareRgba(actual, expected);
          expect(diff.maxAbs, `${path} ${sample.label}`).toBeLessThanOrEqual(
            golden.tolerances.sameEngine.maxAbs,
          );
        }
      }
    },
  );
});
