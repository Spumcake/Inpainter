// @ts-nocheck
/**
 * Script-local Electron engine entry for composition-direct frames.
 * Not part of installed core. Do not import from src/.
 */
import { MotionRenderer } from "../../../.project/demos/animation-demo/core/src/engine/motion/motion-renderer.ts";
import { registerCoreFonts } from "../../../.project/demos/animation-demo/core/src/rendering/register-fonts.ts";

async function frameToPngBytes(image: ImageBitmap, width: number, height: number): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("OffscreenCanvas 2D context is unavailable");
  }
  ctx.drawImage(image, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

async function assertInterLoaded(): Promise<void> {
  const fonts = globalThis.document?.fonts;
  if (!fonts?.load || !fonts.check) {
    throw new Error("FontFaceSet is unavailable; refusing fallback-font baseline");
  }
  const spec = '800 112px "Inter"';
  try {
    await fonts.load(spec);
  } catch (error) {
    throw new Error(
      `Inter 800 failed to load: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!fonts.check(spec)) {
    throw new Error("Inter 800 failed to load; refusing fallback-font baseline");
  }
}

export class InProcessRenderHost {
  async renderFrames(project, requests, onProgress) {
    await registerCoreFonts();
    await assertInterLoaded();
    const compositions = project.motionCompositions ?? [];
    const composition = compositions[0];
    if (!composition) {
      throw new Error("Motion Scene fixture has no motion composition");
    }
    const renderer = new MotionRenderer();
    const results = [];
    for (const [index, request] of requests.entries()) {
      const bitmap = await renderer.renderComposition(composition, request.time, {
        compositionLibrary: compositions,
        supersample: 1,
      });
      const width = composition.width;
      const height = composition.height;
      results.push({
        time: request.time,
        width,
        height,
        bytes: await frameToPngBytes(bitmap, width, height),
      });
      bitmap.close();
      onProgress?.({
        progress: (index + 1) / Math.max(requests.length, 1),
        phase: "frames",
      });
    }
    return results;
  }

  cancel(): void {}

  async dispose(): Promise<void> {}

  async exportVideo() {
    return {
      success: false,
      error: { code: "RENDER_UNAVAILABLE", message: "Composition capture does not export video" },
    };
  }
}
