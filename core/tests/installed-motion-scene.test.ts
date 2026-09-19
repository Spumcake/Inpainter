import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { tryResolveElectronBinary } from "../src/render/host/spawn.ts";
import type { ProductionDocument } from "../src/production/types.ts";
import { loadReferenceManifest, referenceDir } from "./helpers/capture-motion-scene-reference.ts";
import { compareRgba, decodePng } from "./helpers/png-compare.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const installScript = join(repoRoot, "installer", "install.sh");
const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/production");
const INSTALL_MS = 180_000;
const DEMO_ELECTRON_TOKEN = "/.project/demos/animation-demo/";
const hasElectron = Boolean(await tryResolveElectronBinary());
const electronBin = hasElectron ? await tryResolveElectronBinary() : null;
const independentElectron = resolveIndependentElectron();
const hasBwrap = spawnSync("bwrap", ["--version"], { encoding: "utf8" }).status === 0;
const hasXvfb =
  process.platform !== "linux" ||
  spawnSync("which", ["xvfb-run"], { encoding: "utf8" }).status === 0;

const IDS = {
  composition: "motion-1789687867150-iw8bdzf",
  bar: "motion-layer-1789687867150-2entwjc",
  headline: "motion-layer-1789687867150-yfoya39",
  fadeOut: "motion-kf-1789687867150-lyqfobv",
} as const;
const EDITED_TEXT = "HELLO";
const FADE_OUT_TO = 4.6;

const clients: SessionClient[] = [];
let home = "";
let cwd = "";
let bin = "";
let fixtureCopy = "";

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "inpainter-installed-motion-home-"));
  cwd = mkdtempSync(join(tmpdir(), "inpainter-installed-motion-cwd-"));
  fixtureCopy = mkdtempSync(join(tmpdir(), "inpainter-installed-motion-fixture-"));
  cpSync(join(fixtures, "motion-scene"), fixtureCopy, { recursive: true });
  runInstall(home);
  bin = join(home, "bin", "inpainter-core");
}, INSTALL_MS);

afterEach(async () => {
  while (clients.length > 0) {
    const client = clients.pop();
    if (client) {
      await client.dispose();
    }
  }
});

describe("installed motion scene", () => {
  it("keeps document edits available without a render host", { timeout: 30_000 }, async () => {
    const dest = copyInstalledFixture();
    const session = startSession(dest, missingHostEnv());
    const opened = await session.nextJson();
    expect(opened.ok).toBe(true);
    expect(opened.canUndo).toBe(false);

    const texted = await session.request({
      id: "1",
      op: "execute",
      action: {
        type: "motion/updateLayerText",
        params: { compositionId: IDS.composition, layerId: IDS.headline, text: EDITED_TEXT },
      },
    });
    expect(texted.ok).toBe(true);
    expect(layerById(snapshotProject(texted), IDS.headline).text).toBe(EDITED_TEXT);
    expect(texted.canUndo).toBe(true);

    const saved = await session.request({ id: "2", op: "save" });
    expect(saved.ok).toBe(true);
    await session.request({ id: "3", op: "close" });
    expect(await session.waitExit()).toBe(0);

    const reopened = parseCli(["document", "open", "--path", dest], missingHostEnv());
    expect(layerById(reopened.project as ProductionDocument, IDS.headline).text).toBe(EDITED_TEXT);
  });

  it("reports an explicit error when the render host is unavailable", () => {
    const dest = copyInstalledFixture();
    const argv = ["render", "frame", "--path", dest, "--time", "2"];
    const result = runCli(argv, missingHostEnv());
    expect(result.status, result.stderr || result.stdout).not.toBe(0);
    const message = `${result.stdout}\n${result.stderr}`;
    expect(message).toMatch(/Electron binary not found/);
    expect(message).not.toMatch(/animation-demo/);
  });

  it.skipIf(!hasElectron || !hasXvfb)(
    "renders, edits, and reopens through the isolated installed command",
    { timeout: 120_000 },
    async () => {
      const dest = copyInstalledFixture();
      const manifest = loadReferenceManifest();
      const env = renderHostEnv();
      const recorded = {
        command: bin,
        cwd,
        argv: ["render", "frame", "--path", dest, "--time", "2"],
        electron: Boolean(electronBin),
        xvfb: hasXvfb,
        tolerance: manifest.tolerances.port.maxAbs,
      };
      expect(recorded.electron).toBe(true);

      const baseline = parseCli(recorded.argv, env) as { pngBase64: string; time: number };
      expect(baseline.time).toBe(2);
      expect(
        compareRgba(decodeResult(baseline.pngBase64), goldenComposition("t-2s")).maxAbs,
      ).toBeLessThanOrEqual(recorded.tolerance);

      const session = startSession(dest, env);
      const opened = await session.nextJson();
      expect(opened.ok).toBe(true);
      const beforeUntouched = untouchedShapeAndAnimators(snapshotProject(opened));

      const texted = await session.request({
        id: "1",
        op: "execute",
        action: {
          type: "motion/updateLayerText",
          params: { compositionId: IDS.composition, layerId: IDS.headline, text: EDITED_TEXT },
        },
      });
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
      expect(keyframeById(layerById(snapshotProject(moved), IDS.headline), IDS.fadeOut).time).toBe(
        FADE_OUT_TO,
      );

      const unsaved = await session.request({ id: "3", op: "render", times: [2, 4.75] });
      expect(unsaved.ok).toBe(true);
      const unsavedFrames = unsaved.frames as Array<{ time: number; pngBase64: string }>;
      expect(unsavedFrames[0]?.time).toBe(2);
      expect(
        compareRgba(decodeResult(unsavedFrames[0].pngBase64), goldenComposition("t-2s")).maxAbs,
      ).toBeGreaterThan(recorded.tolerance);

      await session.request({ id: "4", op: "undo" });
      const restored = await session.request({ id: "5", op: "undo" });
      expect(layerById(snapshotProject(restored), IDS.headline).text).toBe("Motion Scene");
      await session.request({ id: "6", op: "redo" });
      await session.request({ id: "7", op: "redo" });
      const saved = await session.request({ id: "8", op: "save" });
      expect(saved.ok).toBe(true);
      await session.request({ id: "9", op: "close" });
      expect(await session.waitExit()).toBe(0);

      const next = startSession(dest, env);
      const reopened = await next.nextJson();
      expect(reopened.ok).toBe(true);
      expect(reopened.canUndo).toBe(false);
      expect(layerById(snapshotProject(reopened), IDS.headline).text).toBe(EDITED_TEXT);
      expect(keyframeById(layerById(snapshotProject(reopened), IDS.headline), IDS.fadeOut).time).toBe(
        FADE_OUT_TO,
      );
      expect(untouchedShapeAndAnimators(snapshotProject(reopened))).toEqual(beforeUntouched);
      await next.request({ id: "close", op: "close" });
      expect(await next.waitExit()).toBe(0);

      const persisted = parseCli(["render", "frame", "--path", dest, "--time", "2"], env) as {
        pngBase64: string;
      };
      expect(
        compareRgba(decodeResult(persisted.pngBase64), decodeResult(unsavedFrames[0].pngBase64)).maxAbs,
      ).toBeLessThanOrEqual(recorded.tolerance);
    },
  );

  it.skipIf(!independentElectron || !hasBwrap || !hasXvfb)(
    `proves the installed workflow with demo trees and network unavailable${
      !independentElectron
        ? " (skipped: no independent Electron)"
        : !hasBwrap
          ? " (skipped: bwrap unavailable)"
          : !hasXvfb
            ? " (skipped: xvfb-run unavailable)"
            : ""
    }`,
    { timeout: 120_000 },
    async () => {
      const dest = copyInstalledFixture();
      const manifest = loadReferenceManifest();
      const env = isolatedEnv();
      assertIsolationHidesDemo(dest);

      const baseline = parseIsolatedCli(["render", "frame", "--path", dest, "--time", "2"], env) as {
        pngBase64: string;
        time: number;
      };
      expect(baseline.time).toBe(2);
      expect(
        compareRgba(decodeResult(baseline.pngBase64), goldenComposition("t-2s")).maxAbs,
      ).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);

      const session = startSession(dest, env, true);
      const opened = await session.nextJson();
      expect(opened.ok).toBe(true);

      const texted = await session.request({
        id: "1",
        op: "execute",
        action: {
          type: "motion/updateLayerText",
          params: { compositionId: IDS.composition, layerId: IDS.headline, text: EDITED_TEXT },
        },
      });
      expect(layerById(snapshotProject(texted), IDS.headline).text).toBe(EDITED_TEXT);

      const rendered = await session.request({ id: "2", op: "render", times: [2] });
      expect(rendered.ok).toBe(true);
      const frames = rendered.frames as Array<{ pngBase64: string }>;
      expect(
        compareRgba(decodeResult(frames[0].pngBase64), goldenComposition("t-2s")).maxAbs,
      ).toBeGreaterThan(manifest.tolerances.port.maxAbs);

      const saved = await session.request({ id: "3", op: "save" });
      expect(saved.ok).toBe(true);
      await session.request({ id: "4", op: "close" });
      expect(await session.waitExit()).toBe(0);

      const persisted = parseIsolatedCli(["render", "frame", "--path", dest, "--time", "2"], env) as {
        pngBase64: string;
      };
      expect(
        compareRgba(decodeResult(persisted.pngBase64), decodeResult(frames[0].pngBase64)).maxAbs,
      ).toBeLessThanOrEqual(manifest.tolerances.port.maxAbs);
    },
  );
});

function copyInstalledFixture(): string {
  const dest = mkdtempSync(join(tmpdir(), "inpainter-installed-motion-doc-"));
  cpSync(fixtureCopy, dest, { recursive: true });
  return dest;
}

function runInstall(homeDir: string): void {
  const result = spawnSync("bash", [installScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      INPAINTER_HOME: homeDir,
      INPAINTER_INSTALL_SKIP_PROVIDERS: "1",
    },
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
}

function baseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, INPAINTER_HOME: home };
  delete env.INPAINTER_SKILLS_DIR;
  return env;
}

function missingHostEnv(): NodeJS.ProcessEnv {
  const env = baseEnv();
  env.ELECTRON_BINARY = "/nonexistent-electron-binary";
  return env;
}

function renderHostEnv(): NodeJS.ProcessEnv {
  const env = baseEnv();
  if (electronBin) {
    env.ELECTRON_BINARY = electronBin;
  }
  return env;
}

function resolveIndependentElectron(): string | null {
  const candidates: string[] = [];
  if (process.env.ELECTRON_BINARY) {
    candidates.push(process.env.ELECTRON_BINARY);
  }
  const which = spawnSync("which", ["electron"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) {
    candidates.push(which.stdout.trim());
  }
  for (const candidate of candidates) {
    if (existsSync(candidate) && !candidate.includes(DEMO_ELECTRON_TOKEN)) {
      return candidate;
    }
  }
  return null;
}

function isolatedEnv(): NodeJS.ProcessEnv {
  const env = baseEnv();
  env.ELECTRON_BINARY = independentElectron ?? "";
  env.HOME = home;
  return env;
}

function isolatedBwrapArgs(extraBinds: string[] = []): string[] {
  const demos = join(repoRoot, ".project", "demos");
  const reference = join(fixtures, "motion-scene", "reference");
  const args = [
    "--die-with-parent",
    "--unshare-net",
    "--dev-bind",
    "/dev",
    "/dev",
    "--proc",
    "/proc",
    "--chdir",
    cwd,
    "--setenv",
    "INPAINTER_HOME",
    home,
    "--setenv",
    "ELECTRON_BINARY",
    independentElectron ?? "",
    "--setenv",
    "HOME",
    home,
    "--bind",
    home,
    home,
    "--bind",
    cwd,
    cwd,
    "--bind",
    tmpdir(),
    tmpdir(),
  ];
  if (independentElectron) {
    args.push("--ro-bind", independentElectron, independentElectron);
    const electronDir = dirname(independentElectron);
    if (electronDir !== "/" && existsSync(electronDir)) {
      args.push("--ro-bind", electronDir, electronDir);
    }
  }
  for (const path of ["/dev/shm", "/sys", "/run"]) {
    if (existsSync(path)) {
      args.push(path === "/dev/shm" ? "--bind" : "--ro-bind", path, path);
    }
  }
  for (const path of extraBinds) {
    args.push("--bind", path, path);
  }
  if (existsSync(demos)) {
    args.push("--tmpfs", demos);
  }
  if (existsSync(reference)) {
    args.push("--tmpfs", reference);
  }
  for (const path of ["/usr", "/bin", "/lib", "/lib64", "/etc"]) {
    if (existsSync(path)) {
      args.unshift("--ro-bind", path, path);
    }
  }
  return args;
}

function runIsolatedCli(
  args: string[],
  env: NodeJS.ProcessEnv,
): { stdout: string; status: number; stderr: string } {
  const result = spawnSync("bwrap", [...isolatedBwrapArgs(), bin, ...args], {
    encoding: "utf8",
    cwd,
    env,
  });
  return { stdout: result.stdout, status: result.status ?? 1, stderr: result.stderr };
}

function parseIsolatedCli(args: string[], env: NodeJS.ProcessEnv): Record<string, unknown> {
  const result = runIsolatedCli(args, env);
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function assertIsolationHidesDemo(dest: string): void {
  const demoElectron = join(
    repoRoot,
    ".project/demos/animation-demo/desktop/node_modules/electron/dist/electron",
  );
  const reference = join(fixtures, "motion-scene", "reference");
  const hidden = spawnSync(
    "bwrap",
    [
      ...isolatedBwrapArgs([dest]),
      "sh",
      "-c",
      `test ! -e ${shellQuote(demoElectron)} && test ! -e ${shellQuote(reference)}`,
    ],
    { encoding: "utf8", cwd, env: isolatedEnv() },
  );
  expect(hidden.status, hidden.stderr || hidden.stdout).toBe(0);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = baseEnv(),
): { stdout: string; status: number; stderr: string } {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    cwd,
    env,
  });
  return { stdout: result.stdout, status: result.status ?? 1, stderr: result.stderr };
}

function parseCli(args: string[], env?: NodeJS.ProcessEnv): Record<string, unknown> {
  const result = runCli(args, env);
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function startSession(path: string, env: NodeJS.ProcessEnv, isolated = false): SessionClient {
  const client = new SessionClient(path, env, isolated);
  clients.push(client);
  return client;
}

function snapshotProject(payload: Record<string, unknown>): ProductionDocument {
  return (payload.snapshot as { project: ProductionDocument }).project;
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

function keyframeById(layer: Record<string, unknown>, keyframeId: string): Record<string, unknown> {
  const keyframe = (layer.keyframes as Record<string, unknown>[]).find(
    (candidate) => candidate.id === keyframeId,
  );
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

class SessionClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lines: Interface;
  private readonly pending: Array<(line: string) => void> = [];
  private readonly buffered: string[] = [];
  private exitCode: number | null = null;
  private exitWaiters: Array<(code: number) => void> = [];
  private disposed = false;

  constructor(path: string, env: NodeJS.ProcessEnv, isolated = false) {
    this.child = isolated
      ? spawn("bwrap", [...isolatedBwrapArgs([path]), bin, "document", "session", "--path", path], {
          stdio: ["pipe", "pipe", "pipe"],
          cwd,
          env,
        })
      : spawn(bin, ["document", "session", "--path", path], {
          stdio: ["pipe", "pipe", "pipe"],
          cwd,
          env,
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

  async nextJson(timeoutMs = 90_000): Promise<Record<string, unknown>> {
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
