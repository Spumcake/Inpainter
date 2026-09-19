import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { CoreError } from "../errors.ts";
import { resolveCompositionDirect, resolveInstanceAtTime } from "../production/motion/resolve.ts";
import { validateMotionSupport } from "../production/motion/support.ts";
import type { ProductionDocument, ProjectSettings } from "../production/types.ts";
import {
  ElectronRenderHost,
  assertRequiredFonts,
  packagedFontRoot,
  type RenderSource,
} from "../render/host/spawn.ts";
import { openDocument } from "./documents.ts";

export type RenderDocumentSnapshot = {
  id: string;
  settings: ProjectSettings;
  project: ProductionDocument;
  generation?: number;
};

export type FrameResult = {
  requestId: string;
  documentId: string;
  compositionId: string;
  time: number;
  width: number;
  height: number;
  format: "png";
  pngBase64: string;
  generation: number;
  requestGeneration: number;
};

export function parseRenderSource(value: string | undefined): RenderSource {
  const source = value ?? "composition";
  if (source !== "composition" && source !== "instance") {
    throw new CoreError(`--source must be composition or instance`);
  }
  return source;
}

export async function renderDocumentFrames(input: {
  path?: string;
  snapshot?: RenderDocumentSnapshot;
  generation?: number;
  times: number[];
  source?: RenderSource | string;
  outputPath?: string;
  fontRoot?: string;
  electronBin?: string;
}): Promise<FrameResult[]> {
  if (
    !Array.isArray(input.times) ||
    input.times.length === 0 ||
    input.times.some((time) => typeof time !== "number" || !Number.isFinite(time))
  ) {
    throw new CoreError("time is not finite");
  }
  const source = parseRenderSource(input.source);
  const snapshot = resolveRenderSnapshot(input);
  const generation = input.generation ?? snapshot.generation ?? 0;
  const scene = validateMotionSupport(snapshot.project);
  const instanceView =
    source === "instance" ? resolveInstanceAtTime(snapshot.project, input.times[0]) : undefined;
  const resolved = instanceView ?? resolveCompositionDirect(snapshot.project, input.times[0]);
  const fontRoot = input.fontRoot ?? packagedFontRoot();
  await assertRequiredFonts(fontRoot);
  const host = new ElectronRenderHost();
  try {
    await host.initialize(input.electronBin);
    const frames = await host.renderFrames({
      composition: resolved.composition,
      times: input.times,
      source,
      instance: instanceView?.instance ?? scene.instance,
      projectWidth: snapshot.settings.width,
      projectHeight: snapshot.settings.height,
      trackHidden: instanceView?.trackHidden === true,
      fontRoot,
    });
    const requestId = randomUUID();
    const results = frames.map((frame) => ({
      requestId,
      documentId: snapshot.id,
      compositionId: resolved.composition.id,
      time: frame.time,
      width: frame.width,
      height: frame.height,
      format: "png" as const,
      pngBase64: frame.pngBase64,
      generation,
      requestGeneration: 0,
    }));
    if (input.outputPath) {
      if (results.length !== 1) {
        throw new CoreError("--output is only supported for a single frame");
      }
      await writeFile(resolve(input.outputPath), Buffer.from(results[0].pngBase64, "base64"));
    }
    return results;
  } finally {
    await host.dispose();
  }
}

export async function renderDocumentFrame(input: {
  path?: string;
  snapshot?: RenderDocumentSnapshot;
  generation?: number;
  time: number;
  source?: RenderSource | string;
  outputPath?: string;
  fontRoot?: string;
  electronBin?: string;
}): Promise<FrameResult> {
  const [frame] = await renderDocumentFrames({
    path: input.path,
    snapshot: input.snapshot,
    generation: input.generation,
    times: [input.time],
    source: input.source,
    outputPath: input.outputPath,
    fontRoot: input.fontRoot,
    electronBin: input.electronBin,
  });
  if (!frame) {
    throw new CoreError("Render host returned no PNG frame");
  }
  return frame;
}

function resolveRenderSnapshot(input: {
  path?: string;
  snapshot?: RenderDocumentSnapshot;
}): RenderDocumentSnapshot {
  if (input.snapshot) {
    return input.snapshot;
  }
  if (typeof input.path === "string" && input.path) {
    return openDocument({ path: input.path });
  }
  throw new CoreError("render requires path or snapshot");
}
