import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { openEditSession } from "../src/operations/edits.ts";
import { ManualClock, openPlayback, PLAYBACK_FPS } from "../src/operations/playback.ts";
import { renderDocumentFrames } from "../src/operations/renderFrame.ts";
import {
  tryResolveElectronBinary,
  type RenderFrameJob,
  type RenderHost,
  type HostFrameResult,
} from "../src/render/host/spawn.ts";
import { loadReferenceManifest, referenceDir } from "./helpers/capture-motion-scene-reference.ts";
import { compareRgba, decodePng } from "./helpers/png-compare.ts";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/production");
const tsx = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/.bin/tsx");
const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../src/cli.ts");
const hasElectron = Boolean(await tryResolveElectronBinary());

const IDS = {
  composition: "motion-1789687867150-iw8bdzf",
  headline: "motion-layer-1789687867150-yfoya39",
} as const;

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
  const dest = mkdtempSync(join(tmpdir(), "inpainter-motion-playback-"));
  cpSync(join(fixtures, "motion-scene"), dest, { recursive: true });
  return dest;
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

function goldenInstance(label: string) {
  const manifest = loadReferenceManifest();
  const sample = manifest.samples.find((entry) => entry.label === label);
  if (!sample) {
    throw new Error(`Missing golden ${label}`);
  }
  return decodePng(readFileSync(join(referenceDir(), sample.instance.path)));
}

function pidAlive(pid: number | undefined): boolean {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function fakeFrame(time: number): HostFrameResult {
  return {
    time,
    width: 2,
    height: 2,
    pngBase64: Buffer.from(`t:${time}`).toString("base64"),
  };
}

class ImmediateHost implements RenderHost {
  pid = 11;
  async initialize(): Promise<void> {}
  async renderFrames(job: RenderFrameJob): Promise<HostFrameResult[]> {
    const times = job.times ?? (job.time === undefined ? [] : [job.time]);
    return times.map(fakeFrame);
  }
  async renderFrame(job: RenderFrameJob): Promise<HostFrameResult> {
    return (await this.renderFrames(job))[0];
  }
  async dispose(): Promise<void> {}
}

class RecordingHost extends ImmediateHost {
  readonly jobs: RenderFrameJob[] = [];

  override async renderFrames(job: RenderFrameJob): Promise<HostFrameResult[]> {
    this.jobs.push(job);
    return super.renderFrames(job);
  }
}

class DelayedHost implements RenderHost {
  pid = 22;
  readonly queue: Array<{
    job: RenderFrameJob;
    resolve: (frames: HostFrameResult[]) => void;
    reject: (error: Error) => void;
  }> = [];

  async initialize(): Promise<void> {}

  renderFrames(job: RenderFrameJob): Promise<HostFrameResult[]> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
    });
  }

  async renderFrame(job: RenderFrameJob): Promise<HostFrameResult> {
    return (await this.renderFrames(job))[0];
  }

  async dispose(): Promise<void> {
    for (const item of this.queue.splice(0)) {
      item.reject(new CoreError("Render host failed to start: persistent process exited"));
    }
  }

  flush(index = 0): void {
    const item = this.queue.splice(index, 1)[0];
    if (!item) {
      throw new Error("No delayed render to flush");
    }
    const times = item.job.times ?? (item.job.time === undefined ? [] : [item.job.time]);
    item.resolve(times.map(fakeFrame));
  }

  fail(message: string): void {
    const item = this.queue.shift();
    if (!item) {
      throw new Error("No delayed render to fail");
    }
    item.reject(new CoreError(message));
  }
}

describe("motion scene playback lifecycle", () => {
  it("samples play/pause/seek at 30 fps and does not emit the exclusive duration end", async () => {
    const dest = copyFixture();
    const session = openEditSession({ path: dest });
    const playback = await openPlayback({
      session,
      clock: new ManualClock(),
      host: new ImmediateHost(),
    });
    try {
      const before = session.inspect();
      playback.play();
      const started = await playback.drain();
      expect(started.lastFrame?.time).toBe(0);
      expect(started.isPlaying).toBe(true);

      const stepped = await playback.advance(1000 / PLAYBACK_FPS);
      expect(stepped.playhead).toBeCloseTo(1 / PLAYBACK_FPS, 10);
      expect(stepped.lastFrame?.time).toBeCloseTo(1 / PLAYBACK_FPS, 10);

      playback.pause();
      const paused = await playback.advance(1000 / PLAYBACK_FPS);
      expect(paused.isPlaying).toBe(false);
      expect(paused.playhead).toBeCloseTo(1 / PLAYBACK_FPS, 10);

      const last = playback.seek(149 / PLAYBACK_FPS);
      expect(last.playhead).toBeCloseTo(149 / PLAYBACK_FPS, 10);
      const lastFrame = await playback.drain();
      expect(lastFrame.lastFrame?.time).toBeCloseTo(149 / PLAYBACK_FPS, 10);

      playback.play();
      const ended = await playback.advance(5000);
      expect(ended.isPlaying).toBe(false);
      expect(ended.playhead).toBe(5);
      expect(ended.lastFrame?.time).toBe(5);

      playback.seek(2);
      await playback.drain();
      playback.seek(5);
      const atEnd = await playback.drain();
      expect(atEnd.playhead).toBe(5);
      expect(atEnd.lastFrame?.time).toBe(5);

      const after = session.inspect();
      expect(after.canUndo).toBe(false);
      expect(after.history).toEqual([]);
      expect(after.snapshot.revision).toBe(before.snapshot.revision);
      expect(after.generation).toBe(0);
    } finally {
      await playback.dispose();
      session.close();
    }
  });

  it("advances the playhead from an injected clock without calling advance()", async () => {
    const dest = copyFixture();
    const session = openEditSession({ path: dest });
    const clock = new ManualClock();
    const playback = await openPlayback({
      session,
      clock,
      host: new ImmediateHost(),
    });
    try {
      playback.play();
      await playback.drain();
      expect(playback.inspect().playhead).toBe(0);
      clock.advance(2000);
      const moved = playback.inspect();
      expect(moved.isPlaying).toBe(true);
      expect(moved.playhead).toBe(2);
      const drained = await playback.drain();
      expect(drained.lastFrame?.time).toBe(2);
    } finally {
      await playback.dispose();
      session.close();
    }
  });

  it("switches render source inside an open playback", async () => {
    const dest = copyFixture();
    const session = openEditSession({ path: dest });
    const host = new RecordingHost();
    const playback = await openPlayback({
      session,
      clock: new ManualClock(),
      host,
      source: "composition",
    });
    try {
      playback.seek(2);
      await playback.drain();
      expect(host.jobs.at(-1)?.source).toBe("composition");
      playback.setSource("instance");
      await playback.drain();
      expect(host.jobs.at(-1)?.source).toBe("instance");
    } finally {
      await playback.dispose();
      session.close();
    }
  });

  it("drops delayed older seeks and edits, and stop cancels pending work", async () => {
    const dest = copyFixture();
    const session = openEditSession({ path: dest });
    const host = new DelayedHost();
    const playback = await openPlayback({ session, clock: new ManualClock(), host });
    try {
      playback.seek(0);
      playback.seek(2);
      expect(host.queue).toHaveLength(1);
      host.flush();
      await waitUntil(() => host.queue.length === 1, 1000);
      host.flush();
      const coalesced = await playback.drain();
      expect(coalesced.lastFrame?.time).toBe(2);
      expect(coalesced.lastFrame?.requestGeneration).toBe(coalesced.requestGeneration);
      expect(coalesced.frames).toHaveLength(1);

      playback.seek(4);
      session.execute({
        type: "motion/updateLayerText",
        params: { compositionId: IDS.composition, layerId: IDS.headline, text: "HELLO" },
      });
      host.flush();
      const staleEdit = await playback.drain();
      expect(staleEdit.frames).toEqual([]);
      expect(staleEdit.generation).toBe(1);

      playback.seek(1);
      playback.stop();
      if (host.queue.length > 0) {
        host.flush();
      }
      const stopped = await playback.drain();
      expect(stopped.playhead).toBe(0);
      expect(stopped.isPlaying).toBe(false);
      expect(stopped.lastFrame).toBeUndefined();
    } finally {
      await playback.dispose();
      session.close();
    }
  });

  it("fails the in-flight request when the host dies and leaves history untouched", async () => {
    const dest = copyFixture();
    const session = openEditSession({ path: dest });
    const host = new DelayedHost();
    const playback = await openPlayback({ session, clock: new ManualClock(), host });
    try {
      const before = session.inspect();
      playback.seek(2);
      host.fail("Render host failed to start: persistent process exited");
      await expect(playback.drain()).rejects.toBeInstanceOf(CoreError);
      const after = session.inspect();
      expect(after.history).toEqual(before.history);
      expect(after.canUndo).toBe(false);
      expect(after.snapshot.project.name).toBe(before.snapshot.project.name);
    } finally {
      await playback.dispose();
      session.close();
    }
  });

  it.skipIf(!hasElectron)(
    "reuses one host process and matches direct snapshot frames",
    { timeout: 90_000 },
    async () => {
      const dest = copyFixture();
      const session = openEditSession({ path: dest });
      const playback = await openPlayback({ session, clock: new ManualClock() });
      try {
        const manifest = loadReferenceManifest();
        const first = playback.seek(2);
        const atTwo = await playback.drain();
        expect(atTwo.pid).toBe(first.pid);
        expect(atTwo.lastFrame?.time).toBe(2);
        playback.seek(4.75);
        const atFade = await playback.drain();
        expect(atFade.pid).toBe(first.pid);
        expect(atFade.lastFrame?.time).toBeCloseTo(Math.floor(4.75 * PLAYBACK_FPS) / PLAYBACK_FPS, 10);
        expect(pidAlive(first.pid)).toBe(true);

        const reported = [atTwo.lastFrame?.time ?? 2, atFade.lastFrame?.time ?? 4.75];
        const direct = await renderDocumentFrames({
          snapshot: session.inspect().snapshot,
          times: reported,
        });
        expect(
          compareRgba(decodeResult(atTwo.lastFrame?.pngBase64 ?? ""), decodeResult(direct[0].pngBase64)).maxAbs,
        ).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);
        expect(
          compareRgba(decodeResult(atFade.lastFrame?.pngBase64 ?? ""), decodeResult(direct[1].pngBase64)).maxAbs,
        ).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);
        expect(
          compareRgba(decodeResult(atTwo.lastFrame?.pngBase64 ?? ""), goldenComposition("t-2s")).maxAbs,
        ).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);

        const pid = playback.pid;
        const workDir = playback.workDir;
        await playback.dispose();
        session.close();
        expect(pidAlive(pid)).toBe(false);
        if (workDir) {
          expect(existsSync(workDir)).toBe(false);
        }
      } finally {
        await playback.dispose();
        session.close();
      }
    },
  );

  it.skipIf(!hasElectron)(
    "lazily starts playback on a document session and cleans up after kill",
    { timeout: 90_000 },
    async () => {
      const dest = copyFixture();
      const session = startSession(dest);
      const opened = await session.nextJson();
      expect(opened.ok).toBe(true);
      expect(opened.canUndo).toBe(false);

      const rendered = await session.request({
        id: "1",
        op: "render",
        times: [2],
      });
      expect(rendered.ok).toBe(true);
      const pid = rendered.pid as number;
      expect(pidAlive(pid)).toBe(true);
      expect(session.inspectHistory(rendered)).toEqual([]);
      const frames = rendered.frames as Array<{ time: number; pngBase64: string }>;
      expect(frames[0]?.time).toBe(2);

      const sought = await session.request({ id: "2", op: "seek", time: 149 / 30 });
      expect(sought.ok).toBe(true);
      expect(sought.pid).toBe(pid);
      await session.request({ id: "3", op: "advance", ms: 0 });

      process.kill(pid, "SIGKILL");
      await waitUntil(() => !pidAlive(pid), 5000);

      const afterKill = await session.request({ id: "4", op: "render", times: [2] });
      if (afterKill.ok) {
        expect(afterKill.pid).not.toBe(pid);
        expect(pidAlive(afterKill.pid as number)).toBe(true);
      } else {
        expect(String(afterKill.error)).toMatch(/Render host|persistent process/);
      }

      await session.request({ id: "5", op: "close" });
      expect(await session.waitExit()).toBe(0);
      expect(pidAlive(pid)).toBe(false);
      if (afterKill.ok) {
        expect(pidAlive(afterKill.pid as number)).toBe(false);
      }
    },
  );

  it.skipIf(!hasElectron)(
    "honors session source and exclusive-end seeks through the command interface",
    { timeout: 90_000 },
    async () => {
      const dest = copyFixture();
      const session = startSession(dest);
      const opened = await session.nextJson();
      expect(opened.ok).toBe(true);
      const manifest = loadReferenceManifest();

      const composition = await session.request({
        id: "1",
        op: "render",
        times: [2],
        source: "composition",
      });
      const compositionFrames = composition.frames as Array<{ time: number; pngBase64: string }>;
      expect(
        compareRgba(decodeResult(compositionFrames[0].pngBase64), goldenComposition("t-2s")).maxAbs,
      ).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);

      const instance = await session.request({
        id: "2",
        op: "render",
        times: [2],
        source: "instance",
      });
      const instanceFrames = instance.frames as Array<{ time: number; pngBase64: string }>;
      expect(
        compareRgba(decodeResult(instanceFrames[0].pngBase64), goldenInstance("t-2s")).maxAbs,
      ).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);
      expect(
        compareRgba(decodeResult(instanceFrames[0].pngBase64), goldenComposition("t-2s")).maxAbs,
      ).toBeGreaterThan(manifest.tolerances.port.maxAbs);

      await session.request({ id: "3", op: "seek", time: 2, source: "composition" });
      await session.request({ id: "4", op: "advance", ms: 0 });
      const atEnd = await session.request({ id: "5", op: "seek", time: 5 });
      const drained = await session.request({ id: "6", op: "advance", ms: 0 });
      expect(atEnd.playhead).toBe(5);
      expect((drained.lastFrame as { time: number } | undefined)?.time).toBe(5);
      expect(
        compareRgba(
          decodeResult((drained.lastFrame as { pngBase64: string }).pngBase64),
          goldenComposition("t-5s"),
        ).maxAbs,
      ).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);

      await session.request({ id: "7", op: "close" });
      expect(await session.waitExit()).toBe(0);
    },
  );

  it.skipIf(!hasElectron)(
    "cancels an in-flight session render when stop arrives",
    { timeout: 90_000 },
    async () => {
      const dest = copyFixture();
      const session = startSession(dest);
      const opened = await session.nextJson();
      expect(opened.ok).toBe(true);

      session.send({
        id: "r",
        op: "render",
        times: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5],
      });
      session.send({ id: "s", op: "stop" });
      const first = await session.nextJson();
      const second = await session.nextJson();
      const byId = {
        [String(first.id)]: first,
        [String(second.id)]: second,
      };
      expect(byId.s?.ok).toBe(true);
      expect(byId.s?.lastFrame).toBeUndefined();
      expect(byId.s?.playhead).toBe(0);
      expect(byId.r?.ok).toBe(false);
      expect(String(byId.r?.error)).toMatch(/cancelled/i);

      await session.request({ id: "c", op: "close" });
      expect(await session.waitExit()).toBe(0);
    },
  );
});

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

  inspectHistory(payload: Record<string, unknown>): unknown[] {
    return (payload.history as unknown[]) ?? [];
  }

  async nextJson(timeoutMs = 90000): Promise<Record<string, unknown>> {
    const line = await this.nextLine(timeoutMs);
    return JSON.parse(line) as Record<string, unknown>;
  }

  send(payload: Record<string, unknown>): void {
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async request(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.send(payload);
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

function startSession(path: string): SessionClient {
  const client = new SessionClient(path);
  clients.push(client);
  return client;
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

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("timeout waiting for process exit");
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
}
