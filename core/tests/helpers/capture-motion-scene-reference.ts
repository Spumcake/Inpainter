/**
 * Capture Motion Scene reference PNGs from the owned demo engine.
 * Not imported from src/; not staged by the installer.
 */
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const REFERENCE_WIDTH = 1920;
export const REFERENCE_HEIGHT = 1080;

export const REFERENCE_SAMPLES = [
  { time: 0, label: "t-0s" },
  { time: 0.2, label: "t-0.2s" },
  { time: 0.6, label: "t-0.6s" },
  { time: 0.7, label: "t-0.7s" },
  { time: 2, label: "t-2s" },
  { time: 4.75, label: "t-4.75s" },
  { time: 149 / 30, label: "t-149-30s" },
  { time: 5, label: "t-5s" },
] as const;

export type ReferenceSample = (typeof REFERENCE_SAMPLES)[number];

export type ReferenceFrameRecord = {
  path: string;
  sha256: string;
};

export type ReferenceManifest = {
  schemaVersion: 1;
  capturedAt: string;
  quality: "preview";
  width: number;
  height: number;
  alpha: "unassociated-png";
  checkerboard: false;
  fixture: {
    project: { path: string; sha256: string };
    assets: { path: string; sha256: string };
  };
  fonts: Record<string, string>;
  host: {
    os: string;
    node: string;
    electron: string;
    xvfb: boolean;
    renderer: string;
    hardwareAcceleration: false;
  };
  tolerances: {
    sameEngine: { maxAbs: number; note: string };
    port: {
      maxAbs: number;
      opaqueAlphaFromZeroForbidden: true;
      justification: string;
    };
  };
  samples: Array<{
    time: number;
    label: string;
    instance: ReferenceFrameRecord;
    composition: ReferenceFrameRecord;
  }>;
};

const here = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(here, "../..");
const repoRoot = resolve(coreRoot, "..");

export function demoCoreRoot(): string {
  return resolve(repoRoot, ".project/demos/animation-demo/core");
}

export function fixtureDir(): string {
  return resolve(here, "../fixtures/production/motion-scene");
}

export function referenceDir(): string {
  return join(fixtureDir(), "reference");
}

export function sha256Bytes(bytes: Uint8Array | Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(path: string): Promise<string> {
  return sha256Bytes(await readFile(path));
}

export function loadReferenceManifest(dir = referenceDir()): ReferenceManifest {
  return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as ReferenceManifest;
}

async function assertDemoPresent(demoRoot: string): Promise<void> {
  try {
    await access(join(demoRoot, "src/rendering/host.ts"));
    await access(join(demoRoot, "src/engine/motion/motion-renderer.ts"));
  } catch {
    throw new Error(
      `Owned demo engine not found at ${demoRoot}. Chunk 1 captures frames from animation-demo/core.`,
    );
  }
}

async function resolveElectronBin(demoRoot: string): Promise<string> {
  if (process.env.ELECTRON_BINARY) {
    return process.env.ELECTRON_BINARY;
  }
  const desktop = resolve(demoRoot, "../desktop/node_modules/electron/dist/electron");
  try {
    await access(desktop);
    return desktop;
  } catch {
    // keep looking
  }
  try {
    const { stdout } = await execFileAsync("which", ["electron"]);
    if (stdout.trim()) return stdout.trim();
  } catch {
    // not on PATH
  }
  throw new Error(
    "Electron binary not found. Install animation-demo/desktop electron or set ELECTRON_BINARY.",
  );
}

async function electronVersion(bin: string): Promise<string> {
  const { stdout } = await execFileAsync(bin, ["--no-sandbox", "--version"]);
  return stdout.trim();
}

type DemoHostModule = {
  ElectronRenderHost: new (options?: {
    electronBin?: string;
    timeoutMs?: number;
    assetPathFor?: (mediaId: string) => string | undefined;
  }) => {
    renderFrames(
      project: unknown,
      requests: Array<{ time: number }>,
    ): Promise<Array<{ time: number; width: number; height: number; bytes?: Uint8Array }>>;
    dispose(): Promise<void>;
  };
};

type DemoControllerModule = {
  ProjectController: new () => {
    open(path: string, options: { io: unknown }): Promise<unknown>;
    getProject(): unknown;
    getAssetPath(mediaId: string): string | undefined;
  };
};

type DemoIoModule = {
  createNodeProjectIO: () => unknown;
};

async function importDemo<T>(demoRoot: string, rel: string): Promise<T> {
  return (await import(pathToFileURL(join(demoRoot, rel)).href)) as T;
}

async function bundleCompositionEntry(demoRoot: string): Promise<string> {
  const requireFromDemo = createRequire(join(demoRoot, "package.json"));
  const esbuild = (await import(pathToFileURL(requireFromDemo.resolve("esbuild")).href)) as {
    build: (options: Record<string, unknown>) => Promise<unknown>;
  };
  const outfile = join(tmpdir(), "inpainter-motion-scene-composition.cjs");
  await esbuild.build({
    entryPoints: [join(here, "motion-scene-composition-entry.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile,
    external: ["electron"],
    logLevel: "silent",
  });
  return outfile;
}

function decodeFrameResults(raw: unknown): Array<{
  time: number;
  width: number;
  height: number;
  bytes?: Uint8Array;
}> {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const frame = entry as Record<string, unknown>;
    const pngBase64 = typeof frame.pngBase64 === "string" ? frame.pngBase64 : undefined;
    return {
      time: Number(frame.time ?? 0),
      width: Number(frame.width ?? 0),
      height: Number(frame.height ?? 0),
      bytes: pngBase64 ? Uint8Array.from(Buffer.from(pngBase64, "base64")) : undefined,
    };
  });
}

async function renderCompositionFrames(
  demoRoot: string,
  project: unknown,
  requests: Array<{ time: number }>,
  electronBin: string,
): Promise<Array<{ time: number; width: number; height: number; bytes?: Uint8Array }>> {
  const work = await mkdtemp(join(tmpdir(), "inpainter-motion-scene-composition-"));
  try {
    const jobPath = join(work, "job.json");
    const resultPath = join(work, "result.json");
    const bundled = await bundleCompositionEntry(demoRoot);
    const { projectToJson } = await importDemo<{
      projectToJson: (project: unknown) => string;
    }>(demoRoot, "src/persistence/serializer.ts");
    await writeFile(
      jobPath,
      JSON.stringify({
        projectJson: projectToJson(project),
        resultPath,
        assetPaths: {},
        engineHref: pathToFileURL(bundled).href,
        openreelCoreHref: pathToFileURL(bundled).href,
        coreRoot: demoRoot,
        kind: "frames",
        requests,
      }),
    );
    const main = join(demoRoot, "src/runtime/electron-render-main.mjs");
    const electronArgs = [main, `--job=${jobPath}`, "--no-sandbox"];
    const command = process.platform === "linux" ? "xvfb-run" : electronBin;
    const args =
      process.platform === "linux"
        ? ["-a", "--server-args=-screen 0 1280x720x24", electronBin, ...electronArgs]
        : electronArgs;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ANIMATION_DEMO_CORE_ROOT: demoRoot,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    if (command === "xvfb-run") {
      delete env.DISPLAY;
      delete env.WAYLAND_DISPLAY;
    }
    await new Promise<void>((resolveWait, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env });
      let stderr = "";
      const timeoutMs = Number(process.env.RENDER_TIMEOUT_MS ?? 180_000);
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Composition capture timed out after ${timeoutMs}ms${stderr ? `: ${stderr.trim()}` : ""}`));
      }, timeoutMs);
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolveWait();
        else reject(new Error(`Composition capture exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
      });
    });
    const job = JSON.parse(await readFile(resultPath, "utf8")) as Record<string, unknown>;
    if (job.success === false) {
      const error = job.error as { message?: string } | undefined;
      throw new Error(error?.message ?? "Composition capture failed");
    }
    return decodeFrameResults(job.frames);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function writePng(
  outDir: string,
  pathName: string,
  bytes: Uint8Array | undefined,
  width: number,
  height: number,
): Promise<ReferenceFrameRecord> {
  if (!bytes || bytes.length < 8) {
    throw new Error(`Missing PNG bytes for ${pathName}`);
  }
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error(`Not a PNG: ${pathName}`);
  }
  if (width !== REFERENCE_WIDTH || height !== REFERENCE_HEIGHT) {
    throw new Error(`Unexpected size ${width}x${height} for ${pathName}`);
  }
  const abs = join(outDir, pathName);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
  return { path: pathName, sha256: sha256Bytes(bytes) };
}

export async function captureMotionSceneReference(input: {
  outDir?: string;
} = {}): Promise<ReferenceManifest> {
  const demoRoot = demoCoreRoot();
  await assertDemoPresent(demoRoot);
  const outDir = input.outDir ?? referenceDir();
  const fixture = fixtureDir();
  const work = await mkdtemp(join(tmpdir(), "inpainter-motion-scene-capture-"));
  try {
    await cp(fixture, work, { recursive: true });
    const electronBin = await resolveElectronBin(demoRoot);
    process.env.ELECTRON_BINARY = electronBin;
    const ioMod = await importDemo<DemoIoModule>(demoRoot, "src/persistence/filesystem.ts");
    const controllerMod = await importDemo<DemoControllerModule>(
      demoRoot,
      "src/public/project-controller.ts",
    );
    const hostMod = await importDemo<DemoHostModule>(demoRoot, "src/rendering/host.ts");
    const controller = new controllerMod.ProjectController();
    await controller.open(work, { io: ioMod.createNodeProjectIO() });
    const project = controller.getProject();
    const requests = REFERENCE_SAMPLES.map((sample) => ({ time: sample.time }));

    const instanceHost = new hostMod.ElectronRenderHost({
      electronBin,
      timeoutMs: Number(process.env.RENDER_TIMEOUT_MS ?? 180_000),
      assetPathFor: (mediaId) => controller.getAssetPath(mediaId),
    });
    let instanceFrames: Array<{ time: number; width: number; height: number; bytes?: Uint8Array }>;
    try {
      instanceFrames = await instanceHost.renderFrames(project, requests);
    } finally {
      await instanceHost.dispose();
    }
    if (instanceFrames.length !== REFERENCE_SAMPLES.length) {
      throw new Error(
        `Instance capture returned ${instanceFrames.length} frames, expected ${REFERENCE_SAMPLES.length}`,
      );
    }

    const compositionFrames = await renderCompositionFrames(demoRoot, project, requests, electronBin);
    if (compositionFrames.length !== REFERENCE_SAMPLES.length) {
      throw new Error(
        `Composition capture returned ${compositionFrames.length} frames, expected ${REFERENCE_SAMPLES.length}`,
      );
    }

    await mkdir(join(outDir, "instance"), { recursive: true });
    await mkdir(join(outDir, "composition"), { recursive: true });

    const fontDir = join(demoRoot, "src/resources/fonts");
    const fontFiles = [
      "inter-latin-400-normal.woff2",
      "inter-latin-500-normal.woff2",
      "inter-latin-600-normal.woff2",
      "inter-latin-700-normal.woff2",
      "inter-latin-800-normal.woff2",
      "OFL.txt",
    ];
    const fonts: Record<string, string> = {};
    for (const file of fontFiles) {
      fonts[file] = await sha256File(join(fontDir, file));
    }

    const samples: ReferenceManifest["samples"] = [];
    for (const [index, sample] of REFERENCE_SAMPLES.entries()) {
      const instance = instanceFrames[index];
      const composition = compositionFrames[index];
      samples.push({
        time: sample.time,
        label: sample.label,
        instance: await writePng(
          outDir,
          `instance/${sample.label}.png`,
          instance.bytes,
          instance.width,
          instance.height,
        ),
        composition: await writePng(
          outDir,
          `composition/${sample.label}.png`,
          composition.bytes,
          composition.width,
          composition.height,
        ),
      });
    }

    const manifest: ReferenceManifest = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      quality: "preview",
      width: REFERENCE_WIDTH,
      height: REFERENCE_HEIGHT,
      alpha: "unassociated-png",
      checkerboard: false,
      fixture: {
        project: {
          path: "project.oreel",
          sha256: await sha256File(join(fixture, "project.oreel")),
        },
        assets: {
          path: "project.assets.json",
          sha256: await sha256File(join(fixture, "project.assets.json")),
        },
      },
      fonts,
      host: {
        os: `${process.platform} ${process.arch}`,
        node: process.version,
        electron: await electronVersion(electronBin),
        xvfb: process.platform === "linux",
        renderer: "OffscreenCanvas 2D via Electron offscreen BrowserWindow",
        hardwareAcceleration: false,
      },
      tolerances: {
        sameEngine: {
          maxAbs: 1,
          note: "Decoded RGBA, not PNG bytes. Covers PNG filter rounding on recapture from the same host.",
        },
        port: {
          maxAbs: 2,
          opaqueAlphaFromZeroForbidden: true,
          justification:
            "Canvas AA and Inter rasterization across hosts. Alpha 0 must stay transparent. Not the demo export PSNR≥20 / ±40 RGB crop.",
        },
      },
      samples,
    };
    await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

const launched = process.argv[1] ? resolve(process.argv[1]) : "";
if (launched && fileURLToPath(import.meta.url) === launched) {
  captureMotionSceneReference()
    .then((manifest) => {
      process.stdout.write(`${JSON.stringify({ ok: true, samples: manifest.samples.length }, null, 2)}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exit(1);
    });
}
