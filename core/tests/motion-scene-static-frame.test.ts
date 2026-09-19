import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { renderDocumentFrame } from "../src/operations/renderFrame.ts";
import {
  REQUIRED_INTER_FILE,
  packagedFontRoot,
  tryResolveElectronBinary,
} from "../src/render/host/spawn.ts";
import {
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

const PACKAGED_FONTS = [
  "inter-latin-400-normal.woff2",
  "inter-latin-500-normal.woff2",
  "inter-latin-600-normal.woff2",
  "inter-latin-700-normal.woff2",
  "inter-latin-800-normal.woff2",
  "OFL.txt",
] as const;

function sampleRgba(
  decoded: ReturnType<typeof decodePng>,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * decoded.width + x) * 4;
  return [decoded.data[i], decoded.data[i + 1], decoded.data[i + 2], decoded.data[i + 3]];
}

describe("motion scene settled frame", () => {
  it("packages Inter faces whose hashes match the reference manifest", () => {
    const manifest = loadReferenceManifest();
    const fontRoot = packagedFontRoot();
    for (const file of PACKAGED_FONTS) {
      const bytes = readFileSync(join(fontRoot, file));
      expect(sha256Bytes(bytes), file).toBe(manifest.fonts[file]);
    }
    expect(REQUIRED_INTER_FILE).toBe("inter-latin-800-normal.woff2");
  });

  it("fails closed when the required Inter face is missing", async () => {
    const emptyFonts = mkdtempSync(join(tmpdir(), "inpainter-missing-font-"));
    await expect(
      renderDocumentFrame({
        path: fixturePath,
        time: 2,
        fontRoot: emptyFonts,
      }),
    ).rejects.toBeInstanceOf(CoreError);
    await expect(
      renderDocumentFrame({
        path: fixturePath,
        time: 2,
        fontRoot: emptyFonts,
      }),
    ).rejects.toThrow(/Inter 800/);
  });

  it("fails closed when the Electron host cannot start", async () => {
    await expect(
      renderDocumentFrame({
        path: fixturePath,
        time: 2,
        electronBin: join(tmpdir(), "missing-electron-binary"),
      }),
    ).rejects.toBeInstanceOf(CoreError);
    await expect(
      renderDocumentFrame({
        path: fixturePath,
        time: 2,
        electronBin: join(tmpdir(), "missing-electron-binary"),
      }),
    ).rejects.toThrow(/Render host failed to start/);
  });

  it.skipIf(!hasElectron)(
    "draws the settled 2s composition within port tolerance",
    { timeout: 90_000 },
    async () => {
      const manifest = loadReferenceManifest();
      const result = await renderDocumentFrame({ path: fixturePath, time: 2 });
      expect(result.format).toBe("png");
      expect(result.time).toBe(2);
      expect(result.width).toBe(manifest.width);
      expect(result.height).toBe(manifest.height);
      expect(result.compositionId).toBe("motion-1789687867150-iw8bdzf");
      expect(result.requestId.length).toBeGreaterThan(0);

      const actual = decodePng(Buffer.from(result.pngBase64, "base64"));
      const expected = decodePng(
        readFileSync(join(referenceDir(), "composition/t-2s.png")),
      );
      const diff = compareRgba(actual, expected);
      expect(diff.maxAbs).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);
      expect(diff.opaqueFromZero).toBe(0);
      expect(cornerAlpha(actual)).toEqual([0, 0, 0, 0]);

      const bar = sampleRgba(actual, 960, 702);
      expect(bar[0]).toBeGreaterThan(10);
      expect(bar[1]).toBeGreaterThan(160);
      expect(bar[2]).toBeGreaterThan(140);
      expect(bar[3]).toBe(255);

      const headline = sampleRgba(actual, 960, 540);
      expect(headline[0]).toBeGreaterThan(240);
      expect(headline[1]).toBeGreaterThan(240);
      expect(headline[2]).toBeGreaterThan(240);
      expect(headline[3]).toBe(255);
    },
  );
});
