// @ts-nocheck
/**
 * Electron in-process entry for composition and instance frames.
 * Bundled at spawn time; do not import from the document barrel.
 */
import { drawInstanceFrame } from "../motion/draw-instance.ts";
import { drawSettledComposition } from "../motion/draw-settled.ts";
import { registerPackagedFonts } from "./register-fonts.ts";

async function frameToPngBytes(canvas) {
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

function createCanvas(width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    throw new Error("OffscreenCanvas 2D context is unavailable");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

export class InProcessRenderHost {
  async renderSettledFrame(composition, time, fontRoot, options) {
    const [frame] = await this.renderSettledFrames(composition, [time], fontRoot, options);
    return frame;
  }

  async renderSettledFrames(composition, times, fontRoot, options = {}) {
    await registerPackagedFonts(fontRoot);
    const source = options.source === "instance" ? "instance" : "composition";
    const frames = [];
    for (const time of times) {
      if (source === "instance") {
        const instance = options.instance;
        if (!instance) {
          throw new Error("Instance render requires a motion instance");
        }
        const projectWidth = options.projectWidth ?? composition.width;
        const projectHeight = options.projectHeight ?? composition.height;
        const project = createCanvas(projectWidth, projectHeight);
        const compositionSurface = createCanvas(composition.width, composition.height);
        drawInstanceFrame(
          project.ctx,
          compositionSurface.ctx,
          composition,
          instance,
          time,
          projectWidth,
          projectHeight,
          options.trackHidden === true,
        );
        frames.push({
          time,
          width: projectWidth,
          height: projectHeight,
          bytes: await frameToPngBytes(project.canvas),
        });
        continue;
      }
      const surface = createCanvas(composition.width, composition.height);
      drawSettledComposition(surface.ctx, composition, time);
      frames.push({
        time,
        width: composition.width,
        height: composition.height,
        bytes: await frameToPngBytes(surface.canvas),
      });
    }
    return frames;
  }
}
