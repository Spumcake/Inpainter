import { randomUUID } from "node:crypto";

import { CoreError } from "../errors.ts";
import { resolveCompositionDirect, resolveInstanceAtTime } from "../production/motion/resolve.ts";
import { validateMotionSupport } from "../production/motion/support.ts";
import {
  ElectronRenderHost,
  packagedFontRoot,
  type RenderHost,
  type RenderSource,
} from "../render/host/spawn.ts";
import type { EditSession } from "./edits.ts";
import { parseRenderSource, type FrameResult } from "./renderFrame.ts";

export const PLAYBACK_FPS = 30;

export type Clock = {
  now(): number;
};

export class ManualClock implements Clock {
  private value = 0;

  now(): number {
    return this.value;
  }

  advance(ms: number): void {
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
      throw new CoreError("advance requires a finite non-negative ms");
    }
    this.value += ms;
  }
}

export class RealtimeClock implements Clock {
  now(): number {
    return performance.now();
  }
}

export type PlaybackState = {
  playhead: number;
  isPlaying: boolean;
  requestGeneration: number;
  generation: number;
  frames: FrameResult[];
  lastFrame?: FrameResult;
  pid?: number;
};

type PendingRender = {
  time: number;
  requestId: string;
  requestGeneration: number;
  snapshotGeneration: number;
};

export class PlaybackController {
  private readonly session: EditSession;
  private readonly clock: Clock;
  private source: RenderSource;
  private readonly fps: number;
  private readonly host: RenderHost;
  private playhead = 0;
  private isPlaying = false;
  private originClock = 0;
  private originPlayhead = 0;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private requestGeneration = 0;
  private pending: PendingRender | null = null;
  private inflight: Promise<void> | null = null;
  private lastFrame: FrameResult | undefined;
  private accepted: FrameResult[] = [];
  private lastError: Error | null = null;
  private closed = false;

  constructor(input: {
    session: EditSession;
    clock: Clock;
    source: RenderSource;
    fps: number;
    host: RenderHost;
  }) {
    this.session = input.session;
    this.clock = input.clock;
    this.source = input.source;
    this.fps = input.fps;
    this.host = input.host;
  }

  get pid(): number | undefined {
    return this.host.pid;
  }

  get workDir(): string | undefined {
    return this.host.workDir;
  }

  play(): PlaybackState {
    this.ensureOpen();
    this.isPlaying = true;
    this.originClock = this.clock.now();
    this.originPlayhead = this.playhead;
    this.accepted = [];
    this.bumpRequest();
    if (this.playhead >= this.duration()) {
      this.finishAtEnd();
    } else {
      this.enqueue(this.playhead);
      this.armTick();
    }
    return this.snapshot();
  }

  pause(): PlaybackState {
    this.ensureOpen();
    this.syncPlayheadFromClock();
    this.isPlaying = false;
    this.disarmTick();
    return this.snapshot();
  }

  seek(time: number): PlaybackState {
    this.ensureOpen();
    if (typeof time !== "number" || !Number.isFinite(time)) {
      throw new CoreError("seek requires a finite time");
    }
    this.playhead = clamp(time, 0, this.duration());
    this.originClock = this.clock.now();
    this.originPlayhead = this.playhead;
    this.accepted = [];
    this.bumpRequest();
    if (this.playhead >= this.duration()) {
      this.lastFrame = undefined;
      this.enqueue(this.playhead, true);
      if (!this.isPlaying) {
        this.disarmTick();
      }
    } else {
      this.enqueue(this.playhead);
    }
    return this.snapshot();
  }

  stop(): PlaybackState {
    this.ensureOpen();
    this.isPlaying = false;
    this.disarmTick();
    this.playhead = 0;
    this.originPlayhead = 0;
    this.originClock = this.clock.now();
    this.pending = null;
    this.lastFrame = undefined;
    this.accepted = [];
    this.bumpRequest();
    return this.snapshot();
  }

  setSource(source: RenderSource | string): PlaybackState {
    this.ensureOpen();
    const parsed = parseRenderSource(source);
    if (parsed === this.source) {
      return this.snapshot();
    }
    this.source = parsed;
    this.accepted = [];
    this.bumpRequest();
    this.lastFrame = undefined;
    this.enqueue(this.playhead, this.playhead >= this.duration());
    return this.snapshot();
  }

  async advance(ms: number): Promise<PlaybackState> {
    this.ensureOpen();
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
      throw new CoreError("advance requires a finite non-negative ms");
    }
    if (this.clock instanceof ManualClock) {
      this.clock.advance(ms);
    }
    this.syncSnapshotGeneration();
    this.accepted = [];
    const wasPlaying = this.isPlaying;
    this.syncPlayheadFromClock();
    if (this.isPlaying) {
      this.enqueue(this.playhead);
    } else if (wasPlaying && this.playhead >= this.duration()) {
      // finishAtEnd already enqueued the exclusive-end frame
    }
    await this.drain();
    this.throwIfFailed();
    return this.snapshot(this.accepted);
  }

  async renderTimes(times: number[]): Promise<FrameResult[]> {
    this.ensureOpen();
    if (!Array.isArray(times) || times.length === 0 || times.some((time) => !Number.isFinite(time))) {
      throw new CoreError("time is not finite");
    }
    this.bumpRequest();
    this.accepted = [];
    const requestId = randomUUID();
    const snapshotGeneration = this.session.inspect().generation;
    const requestGeneration = this.requestGeneration;
    const frames = await this.renderAt(times, requestId, requestGeneration, snapshotGeneration);
    this.accepted = frames;
    if (frames[frames.length - 1]) {
      this.lastFrame = frames[frames.length - 1];
    }
    return frames;
  }

  async drain(): Promise<PlaybackState> {
    this.ensureOpen();
    while (this.inflight || this.pending) {
      if (this.inflight) {
        await this.inflight;
      } else {
        this.kick();
      }
    }
    this.throwIfFailed();
    return this.snapshot(this.accepted);
  }

  async dispose(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.isPlaying = false;
    this.disarmTick();
    this.pending = null;
    this.bumpRequest();
    const inflight = this.inflight;
    this.inflight = null;
    await this.host.dispose();
    if (inflight) {
      await inflight.catch(() => undefined);
    }
  }

  inspect(): PlaybackState {
    this.ensureOpen();
    const previousSample = this.sampleTime(this.playhead);
    this.syncPlayheadFromClock();
    if (this.isPlaying && this.sampleTime(this.playhead) !== previousSample) {
      this.enqueue(this.playhead);
    }
    return this.snapshot();
  }

  private snapshot(frames: FrameResult[] = []): PlaybackState {
    this.syncPlayheadFromClock();
    return {
      playhead: this.playhead,
      isPlaying: this.isPlaying,
      requestGeneration: this.requestGeneration,
      generation: this.session.inspect().generation,
      frames,
      lastFrame: this.lastFrame,
      pid: this.host.pid,
    };
  }

  private duration(): number {
    return validateMotionSupport(this.session.inspect().snapshot.project).composition.duration;
  }

  private sampleTime(time: number): number {
    return Math.floor(Math.max(0, time) * this.fps) / this.fps;
  }

  private bumpRequest(): void {
    this.requestGeneration += 1;
  }

  private syncSnapshotGeneration(): void {
    // Results are gated on the live session generation; no extra bump needed here.
  }

  private syncPlayheadFromClock(): void {
    if (!this.isPlaying) {
      return;
    }
    const elapsed = (this.clock.now() - this.originClock) / 1000;
    this.playhead = Math.min(this.originPlayhead + elapsed, this.duration());
    if (this.playhead >= this.duration()) {
      this.finishAtEnd();
    }
  }

  private finishAtEnd(): void {
    this.playhead = this.duration();
    this.isPlaying = false;
    this.disarmTick();
    this.lastFrame = undefined;
    this.enqueue(this.playhead, true);
  }

  private usesScheduler(): boolean {
    return !(this.clock instanceof ManualClock);
  }

  private armTick(): void {
    if (!this.usesScheduler() || this.closed || !this.isPlaying) {
      return;
    }
    this.disarmTick();
    this.tickTimer = setInterval(() => {
      this.tick();
    }, 1000 / this.fps);
  }

  private disarmTick(): void {
    if (this.tickTimer !== undefined) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
  }

  private tick(): void {
    if (this.closed || !this.isPlaying) {
      this.disarmTick();
      return;
    }
    this.syncPlayheadFromClock();
    if (this.isPlaying) {
      this.enqueue(this.playhead);
    }
  }

  private enqueue(time: number, exclusiveEnd = false): void {
    const duration = this.duration();
    if (exclusiveEnd || time >= duration) {
      this.pending = {
        time: duration,
        requestId: randomUUID(),
        requestGeneration: this.requestGeneration,
        snapshotGeneration: this.session.inspect().generation,
      };
      this.kick();
      return;
    }
    const sample = this.sampleTime(time);
    if (sample >= duration) {
      this.pending = null;
      return;
    }
    this.pending = {
      time: sample,
      requestId: randomUUID(),
      requestGeneration: this.requestGeneration,
      snapshotGeneration: this.session.inspect().generation,
    };
    this.kick();
  }

  private kick(): void {
    if (this.inflight || !this.pending || this.closed) {
      return;
    }
    const job = this.pending;
    this.pending = null;
    this.inflight = this.run(job).finally(() => {
      this.inflight = null;
      this.kick();
    });
  }

  private async run(job: PendingRender): Promise<void> {
    try {
      const frames = await this.renderAt(
        [job.time],
        job.requestId,
        job.requestGeneration,
        job.snapshotGeneration,
      );
      const frame = frames[0];
      if (!frame) {
        return;
      }
      this.lastFrame = frame;
      this.accepted.push(frame);
    } catch (error) {
      const live = this.session.inspect();
      if (
        job.requestGeneration === this.requestGeneration &&
        job.snapshotGeneration === live.generation
      ) {
        this.isPlaying = false;
        this.lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  private async renderAt(
    times: number[],
    requestId: string,
    requestGeneration: number,
    snapshotGeneration: number,
  ): Promise<FrameResult[]> {
    const state = this.session.inspect();
    if (requestGeneration !== this.requestGeneration || snapshotGeneration !== state.generation) {
      return [];
    }
    const snapshot = state.snapshot;
    const scene = validateMotionSupport(snapshot.project);
    const instanceView =
      this.source === "instance" ? resolveInstanceAtTime(snapshot.project, times[0]) : undefined;
    const resolved = instanceView ?? resolveCompositionDirect(snapshot.project, times[0]);
    const hostFrames = await this.host.renderFrames({
      composition: resolved.composition,
      times,
      source: this.source,
      instance: instanceView?.instance ?? scene.instance,
      projectWidth: snapshot.settings.width,
      projectHeight: snapshot.settings.height,
      trackHidden: instanceView?.trackHidden === true,
      fontRoot: packagedFontRoot(),
    });
    const latest = this.session.inspect();
    if (requestGeneration !== this.requestGeneration || snapshotGeneration !== latest.generation) {
      return [];
    }
    return hostFrames.map((frame) => ({
      requestId,
      documentId: snapshot.id,
      compositionId: resolved.composition.id,
      time: frame.time,
      width: frame.width,
      height: frame.height,
      format: "png" as const,
      pngBase64: frame.pngBase64,
      generation: snapshotGeneration,
      requestGeneration,
    }));
  }

  private throwIfFailed(): void {
    if (!this.lastError) {
      return;
    }
    const error = this.lastError;
    this.lastError = null;
    throw error instanceof CoreError ? error : new CoreError(error.message);
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new CoreError("Playback is closed.");
    }
    this.session.inspect();
  }
}

export async function openPlayback(input: {
  session: EditSession;
  clock?: Clock;
  source?: RenderSource | string;
  fps?: number;
  host?: RenderHost;
  electronBin?: string;
}): Promise<PlaybackController> {
  const host = input.host ?? new ElectronRenderHost();
  await host.initialize(input.electronBin);
  return new PlaybackController({
    session: input.session,
    clock: input.clock ?? new RealtimeClock(),
    source: parseRenderSource(input.source),
    fps: input.fps ?? PLAYBACK_FPS,
    host,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
