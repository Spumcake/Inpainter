import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { CoreError } from "../../errors.ts";
import type { MotionComposition, MotionInstance } from "../../production/motion/types.ts";
import { REQUIRED_INTER_FILE, assertInterFontFile } from "./register-fonts.ts";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(here, "../../..");

export type HostFrameResult = {
  time: number;
  width: number;
  height: number;
  pngBase64: string;
};

export type RenderSource = "composition" | "instance";

export type RenderFrameJob = {
  composition: MotionComposition;
  time?: number;
  times?: number[];
  source?: RenderSource;
  instance?: MotionInstance;
  projectWidth?: number;
  projectHeight?: number;
  trackHidden?: boolean;
  fontRoot?: string;
  electronBin?: string;
};

export type RenderHost = {
  readonly pid?: number;
  readonly workDir?: string;
  initialize(electronBin?: string): Promise<void>;
  renderFrames(job: RenderFrameJob): Promise<HostFrameResult[]>;
  renderFrame(job: RenderFrameJob): Promise<HostFrameResult>;
  dispose(): Promise<void>;
};

export function packagedFontRoot(): string {
  return join(here, "../resources/fonts");
}

export async function assertRequiredFonts(fontRoot: string): Promise<void> {
  try {
    await assertInterFontFile(fontRoot);
  } catch (error) {
    throw new CoreError(error instanceof Error ? error.message : String(error));
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveElectronBinary(): Promise<string> {
  if (process.env.ELECTRON_BINARY) {
    const configured = process.env.ELECTRON_BINARY;
    if (!(await fileExists(configured))) {
      throw new CoreError(`Render host failed to start: Electron binary not found at ${configured}`);
    }
    return configured;
  }
  try {
    const { stdout } = await execFileAsync("which", ["electron"]);
    if (stdout.trim()) return stdout.trim();
  } catch {
    // not on PATH
  }
  throw new CoreError("Render host failed to start: Electron binary not found. Set ELECTRON_BINARY.");
}

export async function tryResolveElectronBinary(): Promise<string | null> {
  try {
    return await resolveElectronBinary();
  } catch {
    return null;
  }
}

async function assertXvfb(): Promise<void> {
  if (process.platform !== "linux") return;
  try {
    const { stdout } = await execFileAsync("which", ["xvfb-run"]);
    if (stdout.trim()) return;
  } catch {
    // missing
  }
  throw new CoreError("Render host failed to start: xvfb-run is required on Linux");
}

async function bundleCompositionEntry(outfile: string): Promise<void> {
  const requireFromCore = createRequire(join(coreRoot, "package.json"));
  const esbuildHref = pathToFileURL(requireFromCore.resolve("esbuild")).href;
  const esbuild = (await import(esbuildHref)) as {
    build: (options: Record<string, unknown>) => Promise<unknown>;
  };
  await esbuild.build({
    entryPoints: [join(here, "composition-entry.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile,
    logLevel: "silent",
  });
}

async function spawnSettledJob(input: {
  electronBin: string;
  composition: MotionComposition;
  times: number[];
  fontRoot: string;
  source?: RenderSource;
  instance?: MotionInstance;
  projectWidth?: number;
  projectHeight?: number;
  trackHidden?: boolean;
}): Promise<HostFrameResult[]> {
  const work = await mkdtemp(join(tmpdir(), "inpainter-render-frame-"));
  try {
    const jobPath = join(work, "job.json");
    const resultPath = join(work, "result.json");
    const bundled = join(work, "composition-entry.cjs");
    await bundleCompositionEntry(bundled);
    await writeFile(
      jobPath,
      JSON.stringify({
        composition: input.composition,
        times: input.times,
        fontRoot: input.fontRoot,
        source: input.source ?? "composition",
        instance: input.instance,
        projectWidth: input.projectWidth,
        projectHeight: input.projectHeight,
        trackHidden: input.trackHidden === true,
        resultPath,
        engineHref: pathToFileURL(bundled).href,
      }),
    );
    const main = join(here, "electron-main.mjs");
    const electronArgs = [main, `--job=${jobPath}`, "--no-sandbox"];
    const command = process.platform === "linux" ? "xvfb-run" : input.electronBin;
    const args =
      process.platform === "linux"
        ? ["-a", "--server-args=-screen 0 1280x720x24", input.electronBin, ...electronArgs]
        : electronArgs;
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    if (command === "xvfb-run") {
      delete env.DISPLAY;
      delete env.WAYLAND_DISPLAY;
    }
    let stderr = "";
    let exitCode = 1;
    await new Promise<void>((resolveWait, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env });
      const timeoutMs = Number(process.env.RENDER_TIMEOUT_MS ?? 90_000);
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          new CoreError(
            `Render host failed to start: timed out after ${timeoutMs}ms${stderr ? `: ${stderr.trim()}` : ""}`,
          ),
        );
      }, timeoutMs);
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new CoreError(`Render host failed to start: ${error.message}`));
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        exitCode = code ?? 1;
        resolveWait();
      });
    });
    let raw: {
      success?: boolean;
      error?: { message?: string };
      frames?: Array<{ time?: number; width?: number; height?: number; pngBase64?: string }>;
    };
    try {
      raw = JSON.parse(await readFile(resultPath, "utf8")) as typeof raw;
    } catch {
      throw new CoreError(
        `Render host failed to start: exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`,
      );
    }
    if (raw.success === false) {
      throw new CoreError(raw.error?.message ?? "Render host failed to start");
    }
    if (exitCode !== 0) {
      throw new CoreError(
        `Render host failed to start: exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`,
      );
    }
    const frames = (raw.frames ?? []).map((frame, index) => {
      const pngBase64 = frame.pngBase64;
      if (!pngBase64) {
        throw new CoreError("Render host returned no PNG frame");
      }
      return {
        time: Number(frame.time ?? input.times[index] ?? 0),
        width: Number(frame.width ?? 0),
        height: Number(frame.height ?? 0),
        pngBase64,
      };
    });
    if (frames.length !== input.times.length) {
      throw new CoreError(
        `Render host returned ${frames.length} frames, expected ${input.times.length}`,
      );
    }
    return frames;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

export class ElectronRenderHost implements RenderHost {
  #electronBin?: string;
  #initialized = false;
  #child?: ChildProcessWithoutNullStreams;
  #lines?: Interface;
  #work?: string;
  #works: string[] = [];
  #bundled?: string;
  #dead = false;
  #ready = false;
  #reinitAttempted = false;
  #queue: Promise<unknown> = Promise.resolve();
  #pending = new Map<
    string,
    {
      resolve: (
        value: Array<{ time?: number; width?: number; height?: number; pngBase64?: string }>,
      ) => void;
      reject: (error: Error) => void;
    }
  >();
  #readyWaiters: Array<() => void> = [];

  get pid(): number | undefined {
    return this.#child?.pid;
  }

  get workDir(): string | undefined {
    return this.#work;
  }

  async initialize(electronBin?: string): Promise<void> {
    if (this.#initialized && this.#child && !this.#dead) {
      return;
    }
    if (electronBin) {
      if (!(await fileExists(electronBin))) {
        throw new CoreError(`Render host failed to start: Electron binary not found at ${electronBin}`);
      }
      this.#electronBin = electronBin;
    } else {
      this.#electronBin = await resolveElectronBinary();
    }
    await assertXvfb();
    try {
      await this.#start();
      this.#initialized = true;
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }

  async renderFrames(job: RenderFrameJob): Promise<HostFrameResult[]> {
    if (!this.#initialized || !this.#electronBin) {
      throw new CoreError("Render host is not initialized");
    }
    const times = job.times ?? (job.time === undefined ? [] : [job.time]);
    if (times.length === 0 || times.some((time) => typeof time !== "number" || !Number.isFinite(time))) {
      throw new CoreError("time is not finite");
    }
    const fontRoot = job.fontRoot ?? packagedFontRoot();
    await assertRequiredFonts(fontRoot);
    await this.#ensureAlive();
    const payload = {
      composition: job.composition,
      times,
      fontRoot,
      source: job.source ?? "composition",
      instance: job.instance,
      projectWidth: job.projectWidth,
      projectHeight: job.projectHeight,
      trackHidden: job.trackHidden === true,
      engineHref: pathToFileURL(this.#bundled ?? "").href,
    };
    const run = this.#queue.then(() => this.#send(payload, times));
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async renderFrame(job: RenderFrameJob): Promise<HostFrameResult> {
    const [frame] = await this.renderFrames(job);
    if (!frame) {
      throw new CoreError("Render host returned no PNG frame");
    }
    return frame;
  }

  async dispose(): Promise<void> {
    this.#initialized = false;
    await this.#kill();
    await this.#removeWork();
    this.#bundled = undefined;
    this.#electronBin = undefined;
    this.#reinitAttempted = false;
  }

  async #start(): Promise<void> {
    if (!this.#electronBin) {
      throw new CoreError("Render host is not initialized");
    }
    this.#work = await mkdtemp(join(tmpdir(), "inpainter-render-frame-"));
    this.#works.push(this.#work);
    this.#bundled = join(this.#work, "composition-entry.cjs");
    await bundleCompositionEntry(this.#bundled);
    this.#dead = false;
    this.#ready = false;
    this.#child = spawnPersistent(this.#electronBin);
    this.#attach(this.#child);
    await this.#waitReady();
  }

  async #ensureAlive(): Promise<void> {
    if (this.#child && !this.#dead) {
      return;
    }
    if (this.#reinitAttempted) {
      throw new CoreError("Render host failed to start: persistent process exited");
    }
    this.#reinitAttempted = true;
    await this.#kill();
    await this.#removeWork();
    await this.#start();
    this.#reinitAttempted = false;
  }

  #attach(child: ChildProcessWithoutNullStreams): void {
    this.#lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.#lines.on("line", (line) => {
      this.#onLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      // keep stderr flowing so the child cannot block
      void chunk;
    });
    child.on("exit", () => {
      this.#dead = true;
      this.#ready = false;
      const error = new CoreError("Render host failed to start: persistent process exited");
      for (const waiter of this.#pending.values()) {
        waiter.reject(error);
      }
      this.#pending.clear();
      for (const waiter of this.#readyWaiters.splice(0)) {
        waiter();
      }
    });
    child.on("error", (error) => {
      this.#dead = true;
      for (const waiter of this.#pending.values()) {
        waiter.reject(new CoreError(`Render host failed to start: ${error.message}`));
      }
      this.#pending.clear();
    });
  }

  #onLine(line: string): void {
    const trimmed = line.trim();
    const raw = trimmed.startsWith("result:") ? trimmed.slice("result:".length) : trimmed;
    let parsed: {
      id?: string;
      ready?: boolean;
      success?: boolean;
      closed?: boolean;
      error?: { message?: string };
      frames?: Array<{ time?: number; width?: number; height?: number; pngBase64?: string }>;
    };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return;
    }
    if (parsed.ready === true) {
      this.#ready = true;
      for (const waiter of this.#readyWaiters.splice(0)) {
        waiter();
      }
      return;
    }
    if (typeof parsed.id !== "string") {
      return;
    }
    const waiter = this.#pending.get(parsed.id);
    if (!waiter) {
      return;
    }
    this.#pending.delete(parsed.id);
    if (parsed.success === false) {
      waiter.reject(new CoreError(parsed.error?.message ?? "Render host failed to start"));
      return;
    }
    waiter.resolve(parsed.frames ?? []);
  }

  #waitReady(): Promise<void> {
    if (this.#ready) {
      return Promise.resolve();
    }
    const timeoutMs = Number(process.env.RENDER_TIMEOUT_MS ?? 90_000);
    return new Promise((resolveWait, reject) => {
      const timer = setTimeout(() => {
        reject(new CoreError(`Render host failed to start: timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.#readyWaiters.push(() => {
        clearTimeout(timer);
        if (this.#ready) {
          resolveWait();
          return;
        }
        reject(new CoreError("Render host failed to start: persistent process exited"));
      });
    });
  }

  #send(
    job: Record<string, unknown>,
    times: number[],
  ): Promise<HostFrameResult[]> {
    if (!this.#child?.stdin || this.#dead) {
      return Promise.reject(new CoreError("Render host failed to start: persistent process exited"));
    }
    const id = randomUUID();
    const timeoutMs = Number(process.env.RENDER_TIMEOUT_MS ?? 90_000);
    const result = new Promise<
      Array<{ time?: number; width?: number; height?: number; pngBase64?: string }>
    >((resolveWait, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        this.#child?.kill("SIGKILL");
        reject(new CoreError(`Render host failed to start: timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.#pending.set(id, {
        resolve: (frames) => {
          clearTimeout(timer);
          resolveWait(frames);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    this.#child.stdin.write(`${JSON.stringify({ id, job })}\n`);
    return result.then((frames) => {
      const mapped = frames.map((frame, index) => {
        const pngBase64 = frame.pngBase64;
        if (!pngBase64) {
          throw new CoreError("Render host returned no PNG frame");
        }
        return {
          time: Number(frame.time ?? times[index] ?? 0),
          width: Number(frame.width ?? 0),
          height: Number(frame.height ?? 0),
          pngBase64,
        };
      });
      if (mapped.length !== times.length) {
        throw new CoreError(`Render host returned ${mapped.length} frames, expected ${times.length}`);
      }
      return mapped;
    });
  }

  async #kill(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    this.#lines?.close();
    this.#lines = undefined;
    this.#ready = false;
    this.#dead = true;
    const error = new CoreError("Render host failed to start: persistent process exited");
    for (const waiter of this.#pending.values()) {
      waiter.reject(error);
    }
    this.#pending.clear();
    const pid = child?.pid;
    if (!pid) {
      return;
    }
    await new Promise<void>((resolveWait) => {
      const timer = setTimeout(() => resolveWait(), 2000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolveWait();
      });
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      if (child.exitCode !== null || child.signalCode) {
        clearTimeout(timer);
        resolveWait();
      }
    });
  }

  async #removeWork(): Promise<void> {
    const dirs = this.#works.splice(0);
    this.#work = undefined;
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => undefined)));
  }
}

function spawnPersistent(electronBin: string): ChildProcessWithoutNullStreams {
  const main = join(here, "electron-main.mjs");
  const electronArgs = [main, "--persistent", "--no-sandbox"];
  const command = process.platform === "linux" ? "xvfb-run" : electronBin;
  const args =
    process.platform === "linux"
      ? ["-a", "--server-args=-screen 0 1280x720x24", electronBin, ...electronArgs]
      : electronArgs;
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (command === "xvfb-run") {
    delete env.DISPLAY;
    delete env.WAYLAND_DISPLAY;
  }
  return spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env, detached: true });
}

export { REQUIRED_INTER_FILE };
