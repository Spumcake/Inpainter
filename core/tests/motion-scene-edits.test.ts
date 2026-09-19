import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { openEditSession } from "../src/operations/edits.ts";
import { renderDocumentFrames } from "../src/operations/renderFrame.ts";
import { validateMotionSupport } from "../src/production/motion/support.ts";
import { projectFromJson, projectToJson } from "../src/production/serializer.ts";
import type { ProductionDocument } from "../src/production/types.ts";
import { tryResolveElectronBinary } from "../src/render/host/spawn.ts";
import { loadReferenceManifest, referenceDir } from "./helpers/capture-motion-scene-reference.ts";
import { compareRgba, decodePng } from "./helpers/png-compare.ts";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/production");
const tsx = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/.bin/tsx");
const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../src/cli.ts");
const hasElectron = Boolean(await tryResolveElectronBinary());

const IDS = {
  composition: "motion-1789687867150-iw8bdzf",
  bar: "motion-layer-1789687867150-2entwjc",
  headline: "motion-layer-1789687867150-yfoya39",
  fadeOut: "motion-kf-1789687867150-lyqfobv",
} as const;

const EDITED_TEXT = "HELLO";
const FADE_OUT_TO = 4.6;

const clients: SessionClient[] = [];

afterEach(async () => {
  while (clients.length > 0) {
    const client = clients.pop();
    if (client) {
      await client.dispose();
    }
  }
});

function copyFixture(): string {
  const dest = mkdtempSync(join(tmpdir(), "inpainter-motion-edits-"));
  cpSync(join(fixtures, "motion-scene"), dest, { recursive: true });
  return dest;
}

function compositionRecord(project: ProductionDocument): Record<string, unknown> {
  return project.motionCompositions[0] as Record<string, unknown>;
}

function layersOf(project: ProductionDocument): Record<string, unknown>[] {
  return compositionRecord(project).layers as Record<string, unknown>[];
}

function layerById(project: ProductionDocument, layerId: string): Record<string, unknown> {
  const layer = layersOf(project).find((candidate) => candidate.id === layerId);
  if (!layer) {
    throw new Error(`Layer not found: ${layerId}`);
  }
  return layer;
}

function keyframesOf(layer: Record<string, unknown>): Record<string, unknown>[] {
  return layer.keyframes as Record<string, unknown>[];
}

function keyframeById(layer: Record<string, unknown>, keyframeId: string): Record<string, unknown> {
  const keyframe = keyframesOf(layer).find((candidate) => candidate.id === keyframeId);
  if (!keyframe) {
    throw new Error(`Keyframe not found: ${keyframeId}`);
  }
  return keyframe;
}

function untouchedShapeAndAnimators(project: ProductionDocument): {
  bar: unknown;
  animators: unknown;
  style: unknown;
} {
  const headline = layerById(project, IDS.headline);
  return {
    bar: layerById(project, IDS.bar),
    animators: headline.textAnimators,
    style: headline.style,
  };
}

function decodeResult(pngBase64: string) {
  return decodePng(Buffer.from(pngBase64, "base64"));
}

function goldenComposition(label: string) {
  const manifest = loadReferenceManifest();
  const sample = manifest.samples.find((entry) => entry.label === label);
  if (!sample) {
    throw new Error(`Missing golden ${label}`);
  }
  return decodePng(readFileSync(join(referenceDir(), sample.composition.path)));
}

describe("motion scene feature edits", () => {
  it("updates headline text and one key time through existing history", () => {
    const dest = copyFixture();
    const session = openEditSession({ path: dest });
    try {
      const opened = session.inspect();
      expect(opened.generation).toBe(0);
      expect(opened.snapshot.generation).toBe(0);
      const beforeUntouched = untouchedShapeAndAnimators(opened.snapshot.project);
      const headlineKeys = keyframesOf(layerById(opened.snapshot.project, IDS.headline)).map(
        (keyframe) => keyframe.id,
      );

      const renamed = session.execute({
        type: "motion/updateLayerText",
        params: { compositionId: IDS.composition, layerId: IDS.headline, text: EDITED_TEXT },
      });
      expect(renamed.generation).toBe(1);
      expect(renamed.canUndo).toBe(true);
      expect(renamed.history).toEqual([
        expect.objectContaining({ type: "motion/updateLayerText", description: "Update layer text" }),
      ]);
      expect(layerById(renamed.snapshot.project, IDS.headline).text).toBe(EDITED_TEXT);
      expect(untouchedShapeAndAnimators(renamed.snapshot.project)).toEqual(beforeUntouched);

      const moved = session.execute({
        type: "motion/updateLayerKeyframeTime",
        params: {
          compositionId: IDS.composition,
          layerId: IDS.headline,
          keyframeId: IDS.fadeOut,
          toTime: FADE_OUT_TO,
        },
      });
      expect(moved.generation).toBe(2);
      expect(keyframeById(layerById(moved.snapshot.project, IDS.headline), IDS.fadeOut).time).toBe(
        FADE_OUT_TO,
      );
      expect(keyframesOf(layerById(moved.snapshot.project, IDS.headline)).map((keyframe) => keyframe.id)).toEqual(
        headlineKeys,
      );
      expect(untouchedShapeAndAnimators(moved.snapshot.project)).toEqual(beforeUntouched);

      const coincident = session.execute({
        type: "motion/updateLayerKeyframeTime",
        params: {
          compositionId: IDS.composition,
          layerId: IDS.headline,
          keyframeId: IDS.fadeOut,
          toTime: 4.5,
        },
      });
      const coincidentKeys = keyframesOf(layerById(coincident.snapshot.project, IDS.headline));
      expect(coincidentKeys.map((keyframe) => keyframe.id)).toEqual(headlineKeys);
      expect(coincidentKeys.filter((keyframe) => keyframe.time === 4.5)).toHaveLength(2);

      const undoneCoincident = session.undo();
      expect(keyframeById(layerById(undoneCoincident.snapshot.project, IDS.headline), IDS.fadeOut).time).toBe(
        FADE_OUT_TO,
      );
      const undoneMove = session.undo();
      expect(keyframeById(layerById(undoneMove.snapshot.project, IDS.headline), IDS.fadeOut).time).toBe(5);
      const undoneText = session.undo();
      expect(layerById(undoneText.snapshot.project, IDS.headline).text).toBe("Motion Scene");
      expect(untouchedShapeAndAnimators(undoneText.snapshot.project)).toEqual(beforeUntouched);

      session.redo();
      const redone = session.redo();
      expect(layerById(redone.snapshot.project, IDS.headline).text).toBe(EDITED_TEXT);
      expect(keyframeById(layerById(redone.snapshot.project, IDS.headline), IDS.fadeOut).time).toBe(
        FADE_OUT_TO,
      );
    } finally {
      session.close();
    }
  });

  it("keeps an empty headline renderable and undoable", { timeout: 90_000 }, async () => {
    const dest = copyFixture();
    const session = openEditSession({ path: dest });
    try {
      const emptied = session.execute({
        type: "motion/updateLayerText",
        params: { compositionId: IDS.composition, layerId: IDS.headline, text: "" },
      });
      expect(emptied.canUndo).toBe(true);
      expect(layerById(emptied.snapshot.project, IDS.headline).text).toBe("");
      expect(() => validateMotionSupport(emptied.snapshot.project)).not.toThrow();
      if (hasElectron) {
        const frames = await renderDocumentFrames({
          snapshot: emptied.snapshot,
          times: [2],
        });
        expect(frames[0]?.time).toBe(2);
        expect(frames[0]?.pngBase64.length).toBeGreaterThan(0);
      }
      const restored = session.undo();
      expect(layerById(restored.snapshot.project, IDS.headline).text).toBe("Motion Scene");
    } finally {
      session.close();
    }
  });

  it("rejects invalid motion edits without changing content, history, or generation", () => {
    const dest = copyFixture();
    const projectFile = join(dest, "project.oreel");
    const project = projectFromJson(readFileSync(projectFile, "utf8"));
    keyframesOf(layerById(project, IDS.headline)).push({
      id: "motion-kf-unsupported",
      time: 1,
      property: "transform.position.x",
      value: 0,
      easing: "linear",
    });
    writeFileSync(projectFile, projectToJson(project));

    const session = openEditSession({ path: dest });
    try {
      const before = session.inspect();
      const beforeJson = projectToJson(before.snapshot.project);
      const attempts = [
        {
          type: "motion/updateLayerText",
          params: { compositionId: "missing", layerId: IDS.headline, text: EDITED_TEXT },
        },
        {
          type: "motion/updateLayerText",
          params: { compositionId: IDS.composition, layerId: IDS.bar, text: EDITED_TEXT },
        },
        {
          type: "motion/updateLayerKeyframeTime",
          params: {
            compositionId: IDS.composition,
            layerId: IDS.headline,
            keyframeId: "missing-key",
            toTime: 1,
          },
        },
        {
          type: "motion/updateLayerKeyframeTime",
          params: {
            compositionId: IDS.composition,
            layerId: IDS.headline,
            keyframeId: IDS.fadeOut,
            toTime: Number.NaN,
          },
        },
        {
          type: "motion/updateLayerKeyframeTime",
          params: {
            compositionId: IDS.composition,
            layerId: IDS.headline,
            keyframeId: IDS.fadeOut,
            toTime: 6,
          },
        },
        {
          type: "motion/updateLayerKeyframeTime",
          params: {
            compositionId: IDS.composition,
            layerId: IDS.headline,
            keyframeId: "motion-kf-unsupported",
            toTime: 2,
          },
        },
      ];

      for (const action of attempts) {
        expect(() => session.execute(action)).toThrow(CoreError);
      }

      const after = session.inspect();
      expect(after.generation).toBe(0);
      expect(after.history).toEqual([]);
      expect(after.canUndo).toBe(false);
      expect(projectToJson(after.snapshot.project)).toBe(beforeJson);
    } finally {
      session.close();
    }
  });

  it("executes both motion edits through document session; undo does not survive reopen", {
    timeout: 15_000,
  }, async () => {
    const dest = copyFixture();
    const session = startSession(dest);
    const opened = await session.nextJson();
    expect(opened.ok).toBe(true);
    expect(opened.canUndo).toBe(false);
    expect(opened.generation).toBe(0);

    const texted = await session.request({
      id: "1",
      op: "execute",
      action: {
        type: "motion/updateLayerText",
        params: { compositionId: IDS.composition, layerId: IDS.headline, text: EDITED_TEXT },
      },
    });
    expect(texted.ok).toBe(true);
    expect(texted.generation).toBe(1);
    expect(layerById(snapshotProject(texted), IDS.headline).text).toBe(EDITED_TEXT);

    const moved = await session.request({
      id: "2",
      op: "execute",
      action: {
        type: "motion/updateLayerKeyframeTime",
        params: {
          compositionId: IDS.composition,
          layerId: IDS.headline,
          keyframeId: IDS.fadeOut,
          toTime: FADE_OUT_TO,
        },
      },
    });
    expect(moved.ok).toBe(true);
    expect(moved.generation).toBe(2);

    const saved = await session.request({ id: "3", op: "save" });
    expect(saved.ok).toBe(true);
    await session.request({ id: "4", op: "close" });
    expect(await session.waitExit()).toBe(0);

    const next = startSession(dest);
    const reopened = await next.nextJson();
    expect(reopened.ok).toBe(true);
    expect(reopened.canUndo).toBe(false);
    expect(reopened.generation).toBe(0);
    expect(layerById(snapshotProject(reopened), IDS.headline).text).toBe(EDITED_TEXT);
    expect(keyframeById(layerById(snapshotProject(reopened), IDS.headline), IDS.fadeOut).time).toBe(
      FADE_OUT_TO,
    );
    await next.request({ id: "close", op: "close" });
    expect(await next.waitExit()).toBe(0);
  });

  it.skipIf(!hasElectron)(
    "renders the unsaved session snapshot and restores frames on undo",
    { timeout: 90_000 },
    async () => {
      const dest = copyFixture();
      const session = openEditSession({ path: dest });
      try {
        const manifest = loadReferenceManifest();
        const opened = session.inspect();
        const beforeUntouched = untouchedShapeAndAnimators(opened.snapshot.project);

        const baseline = await renderDocumentFrames({
          snapshot: opened.snapshot,
          times: [2, 4.75],
        });
        expect(baseline[0].generation).toBe(0);
        expect(compareRgba(decodeResult(baseline[0].pngBase64), goldenComposition("t-2s")).maxAbs)
          .toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);
        expect(compareRgba(decodeResult(baseline[1].pngBase64), goldenComposition("t-4.75s")).maxAbs)
          .toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);

        const edited = session.executeMany([
          {
            type: "motion/updateLayerText",
            params: { compositionId: IDS.composition, layerId: IDS.headline, text: EDITED_TEXT },
          },
          {
            type: "motion/updateLayerKeyframeTime",
            params: {
              compositionId: IDS.composition,
              layerId: IDS.headline,
              keyframeId: IDS.fadeOut,
              toTime: FADE_OUT_TO,
            },
          },
        ]);
        expect(edited.generation).toBe(2);
        expect(untouchedShapeAndAnimators(edited.snapshot.project)).toEqual(beforeUntouched);

        const unsaved = await renderDocumentFrames({
          snapshot: edited.snapshot,
          times: [2, 4.75],
        });
        expect(unsaved[0].generation).toBe(2);
        expect(compareRgba(decodeResult(unsaved[0].pngBase64), goldenComposition("t-2s")).maxAbs)
          .toBeGreaterThan(manifest.tolerances.port.maxAbs);
        expect(compareRgba(decodeResult(unsaved[1].pngBase64), goldenComposition("t-4.75s")).maxAbs)
          .toBeGreaterThan(manifest.tolerances.port.maxAbs);

        const diskWhileDirty = await renderDocumentFrames({ path: dest, times: [2, 4.75] });
        expect(diskWhileDirty[0].generation).toBe(0);
        expect(
          compareRgba(decodeResult(diskWhileDirty[0].pngBase64), goldenComposition("t-2s")).maxAbs,
        ).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);

        session.undo();
        const restored = session.undo();
        expect(layerById(restored.snapshot.project, IDS.headline).text).toBe("Motion Scene");
        expect(keyframeById(layerById(restored.snapshot.project, IDS.headline), IDS.fadeOut).time).toBe(5);
        expect(restored.generation).toBe(4);

        const undoneFrames = await renderDocumentFrames({
          snapshot: restored.snapshot,
          times: [2, 4.75],
        });
        expect(undoneFrames[0].generation).toBe(4);
        expect(compareRgba(decodeResult(undoneFrames[0].pngBase64), goldenComposition("t-2s")).maxAbs)
          .toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);
        expect(compareRgba(decodeResult(undoneFrames[1].pngBase64), goldenComposition("t-4.75s")).maxAbs)
          .toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);

        session.redo();
        const redone = session.redo();
        expect(redone.generation).toBe(6);
        const redoneFrames = await renderDocumentFrames({
          snapshot: redone.snapshot,
          times: [2, 4.75],
        });
        expect(redoneFrames[0].generation).toBe(6);
        expect(compareRgba(decodeResult(redoneFrames[0].pngBase64), decodeResult(unsaved[0].pngBase64)).maxAbs)
          .toBeLessThanOrEqual(manifest.tolerances.sameEngine.maxAbs);

        session.save();
        session.close();

        const reopened = openEditSession({ path: dest });
        try {
          const fresh = reopened.inspect();
          expect(fresh.canUndo).toBe(false);
          expect(fresh.generation).toBe(0);
          expect(layerById(fresh.snapshot.project, IDS.headline).text).toBe(EDITED_TEXT);
          expect(keyframeById(layerById(fresh.snapshot.project, IDS.headline), IDS.fadeOut).time).toBe(
            FADE_OUT_TO,
          );
          expect(untouchedShapeAndAnimators(fresh.snapshot.project)).toEqual(beforeUntouched);

          const persisted = await renderDocumentFrames({ path: dest, times: [2, 4.75] });
          expect(compareRgba(decodeResult(persisted[0].pngBase64), decodeResult(unsaved[0].pngBase64)).maxAbs)
            .toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);
          expect(compareRgba(decodeResult(persisted[1].pngBase64), decodeResult(unsaved[1].pngBase64)).maxAbs)
            .toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);
        } finally {
          reopened.close();
        }
      } finally {
        if (session) {
          try {
            session.close();
          } catch {
            // already closed after save
          }
        }
      }
    },
  );
});

function snapshotProject(payload: Record<string, unknown>): ProductionDocument {
  return (payload.snapshot as { project: ProductionDocument }).project;
}

function startSession(path: string): SessionClient {
  const client = new SessionClient(path);
  clients.push(client);
  return client;
}

class SessionClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lines: Interface;
  private readonly pending: Array<(line: string) => void> = [];
  private readonly buffered: string[] = [];
  private exitCode: number | null = null;
  private exitWaiters: Array<(code: number) => void> = [];
  private disposed = false;

  constructor(path: string) {
    this.child = spawn(tsx, [cli, "document", "session", "--path", path], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on("line", (line) => {
      const waiter = this.pending.shift();
      if (waiter) {
        waiter(line);
      } else {
        this.buffered.push(line);
      }
    });
    this.child.on("exit", (code) => {
      this.exitCode = code ?? 1;
      for (const waiter of this.exitWaiters.splice(0)) {
        waiter(this.exitCode);
      }
    });
  }

  async nextJson(timeoutMs = 15000): Promise<Record<string, unknown>> {
    const line = await this.nextLine(timeoutMs);
    return JSON.parse(line) as Record<string, unknown>;
  }

  async request(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    const response = await this.nextJson();
    expect(response.id).toBe(payload.id);
    return response;
  }

  waitExit(timeoutMs = 15000): Promise<number> {
    if (this.exitCode !== null) {
      return Promise.resolve(this.exitCode);
    }
    return withTimeout(
      new Promise((resolveWaiter) => {
        this.exitWaiters.push(resolveWaiter);
      }),
      timeoutMs,
      "timeout waiting for session exit",
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.lines.close();
    if (this.exitCode === null) {
      this.child.kill("SIGKILL");
      await this.waitExit().catch(() => undefined);
    }
  }

  private nextLine(timeoutMs: number): Promise<string> {
    if (this.buffered.length > 0) {
      return Promise.resolve(this.buffered.shift() as string);
    }
    return withTimeout(
      new Promise((resolveWaiter) => {
        this.pending.push(resolveWaiter);
      }),
      timeoutMs,
      "timeout waiting for session output",
    );
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolveWaiter, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolveWaiter(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
