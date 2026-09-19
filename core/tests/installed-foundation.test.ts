import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const installScript = join(repoRoot, "installer", "install.sh");
const fixtureImage = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/production/assets/accent.png",
);
const INSTALL_MS = 180_000;
const PACKAGING_TOKENS = [
  "animation-demo",
  "@openreel/",
  ".project/demos",
  "@paper-design/shaders",
  "video-engine",
  "motion-renderer",
];
const MODULE_PATH_TOKENS = [
  "animation-demo",
  "openreel-video",
  ".project/demos",
  "@openreel",
  "@paper-design",
  "video-engine",
  "motion-renderer",
];

const clients: SessionClient[] = [];
let home = "";
let cwd = "";
let bin = "";

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "inpainter-installed-home-"));
  cwd = mkdtempSync(join(tmpdir(), "inpainter-installed-cwd-"));
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

describe("installed foundation", () => {
  it("stages tracked core without demo or OpenReel runtime resolution", () => {
    expect(existsSync(join(home, "runtime/core/src/production/NOTICE"))).toBe(true);
    expect(existsSync(join(home, "runtime/core/src/render/NOTICE"))).toBe(true);
    expect(existsSync(join(home, "runtime/core/src/render/host/electron-main.mjs"))).toBe(true);
    expect(existsSync(join(home, "runtime/core/src/render/host/electron-renderer.html"))).toBe(true);
    expect(existsSync(join(home, "runtime/core/src/render/resources/fonts/inter-latin-800-normal.woff2"))).toBe(
      true,
    );
    expect(existsSync(join(home, "runtime/core/src/render/resources/fonts/inter-latin-400-normal.woff2"))).toBe(
      true,
    );
    expect(existsSync(join(home, "runtime/core/src/render/resources/fonts/inter-latin-500-normal.woff2"))).toBe(
      true,
    );
    expect(existsSync(join(home, "runtime/core/src/render/resources/fonts/inter-latin-600-normal.woff2"))).toBe(
      true,
    );
    expect(existsSync(join(home, "runtime/core/src/render/resources/fonts/inter-latin-700-normal.woff2"))).toBe(
      true,
    );
    expect(existsSync(join(home, "runtime/core/src/render/resources/fonts/OFL.txt"))).toBe(true);
    expect(existsSync(join(home, "runtime/core/node_modules/esbuild/package.json"))).toBe(true);
    expect(existsSync(join(home, "runtime/core/src/operations/documentSession.ts"))).toBe(true);
    expect(existsSync(join(home, "runtime/core/src/cli.ts"))).toBe(true);
    expect(existsSync(bin)).toBe(true);

    const manifest = readFileSync(join(home, "runtime/core/package.json"), "utf8");
    const lockfile = readFileSync(join(home, "runtime/core/pnpm-lock.yaml"), "utf8");
    for (const token of PACKAGING_TOKENS) {
      expect(manifest.includes(token), `package.json contains ${token}`).toBe(false);
      expect(lockfile.includes(token), `pnpm-lock.yaml contains ${token}`).toBe(false);
    }
    assertCleanModuleTree(join(home, "runtime/core/node_modules"));
    maybeBwrapHomeStatus();
  });

  it(
    "creates, attaches, edits, saves, and reopens through the installed command",
    { timeout: 30_000 },
    async () => {
      const status = parseCli(["home", "status"]);
      expect(status).toEqual(expect.any(Object));
      const listed = parseCli(["workspace", "list"]);
      expect(Array.isArray(listed.workspaces)).toBe(true);
      expect(parseCli(["settings", "get"])).toEqual(expect.any(Object));
      expect(parseCli(["skill", "show", "--id", "openai/discuss"]).id).toBe("openai/discuss");

      const workspaceDir = mkdtempSync(join(tmpdir(), "inpainter-installed-workspace-"));
      const workspace = parseCli([
        "workspace",
        "create",
        "--name",
        "Installed Film",
        "--location",
        workspaceDir,
      ]);
      const workspaceId = String(workspace.id);
      const folder = mkdtempSync(join(tmpdir(), "inpainter-installed-folder-"));
      const attached = parseCli(["folder", "attach", "--workspace-id", workspaceId, "--path", folder]);
      const folderId = String((attached.folder as { id: string }).id);
      const documentPath = String((attached.document as { path: string }).path);
      const documentId = String((attached.document as { id: string }).id);
      expect(existsSync(join(folder, ".inpainter", "production", "project.oreel"))).toBe(true);

      mkdirSync(join(folder, "Images"), { recursive: true });
      const imagePath = join(folder, "Images", "accent.png");
      cpSync(fixtureImage, imagePath);
      const registered = parseCli([
        "asset",
        "register",
        "--workspace-id",
        workspaceId,
        "--folder-id",
        folderId,
        "--path",
        imagePath,
      ]);
      expect(registered.relativePath).toBe("Images/accent.png");
      const resolved = parseCli([
        "asset",
        "resolve",
        "--workspace-id",
        workspaceId,
        "--folder-id",
        folderId,
        "--id",
        String(registered.mediaId),
      ]);
      expect(resolved.relativePath).toBe("Images/accent.png");
      expect(readFileSync(String(resolved.path))).toEqual(readFileSync(fixtureImage));

      const session = startSession(documentPath);
      const opened = await session.nextJson();
      expect(opened.ok).toBe(true);
      const originalName = snapshotName(opened);
      const renamed = await session.request({
        id: "1",
        op: "execute",
        action: { type: "project/rename", params: { name: "Installed Cut" } },
      });
      expect(snapshotName(renamed)).toBe("Installed Cut");
      expect(renamed.canUndo).toBe(true);
      expect(snapshotName(await session.request({ id: "2", op: "undo" }))).toBe(originalName);
      expect(snapshotName(await session.request({ id: "3", op: "redo" }))).toBe("Installed Cut");
      const saved = await session.request({ id: "4", op: "save" });
      expect(saved.ok).toBe(true);
      await session.request({ id: "5", op: "close" });
      expect(await session.waitExit()).toBe(0);

      const reopened = parseCli(["document", "open", "--path", documentPath]);
      expect(reopened.name).toBe("Installed Cut");
      expect(reopened.id).toBe(documentId);

      const next = startSession(documentPath);
      const nextOpen = await next.nextJson();
      expect(snapshotName(nextOpen)).toBe("Installed Cut");
      expect(nextOpen.canUndo).toBe(false);
      await next.request({ id: "close", op: "close" });
      expect(await next.waitExit()).toBe(0);

      parseCli(["folder", "detach", "--workspace-id", workspaceId, "--id", folderId]);
      expect((parseCli(["folder", "list", "--workspace-id", workspaceId]).folders as unknown[])).toEqual(
        [],
      );
      const reattached = parseCli(["folder", "attach", "--workspace-id", workspaceId, "--path", folder]);
      expect((reattached.folder as { id: string }).id).toBe(folderId);
      const afterReattach = parseCli([
        "asset",
        "resolve",
        "--workspace-id",
        workspaceId,
        "--folder-id",
        folderId,
        "--id",
        String(registered.mediaId),
      ]);
      expect(afterReattach.relativePath).toBe("Images/accent.png");

      const secondFolder = mkdtempSync(join(tmpdir(), "inpainter-installed-folder-b-"));
      const second = parseCli([
        "folder",
        "attach",
        "--workspace-id",
        workspaceId,
        "--path",
        secondFolder,
      ]);
      expect((second.folder as { id: string }).id).not.toBe(folderId);
      const secondOpen = parseCli([
        "folder",
        "open",
        "--workspace-id",
        workspaceId,
        "--id",
        String((second.folder as { id: string }).id),
      ]);
      expect(secondOpen.id).not.toBe(documentId);
    },
  );

  it("replaces the staged runtime on reinstall", { timeout: INSTALL_MS }, () => {
    runInstall(home);
    expect(existsSync(join(home, "runtime.next"))).toBe(false);
    expect(existsSync(bin)).toBe(true);
    const status = parseCli(["home", "status"]);
    expect(status).toEqual(expect.any(Object));
  });
});

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

function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, INPAINTER_HOME: home };
  delete env.INPAINTER_SKILLS_DIR;
  return env;
}

function runCli(args: string[]): { stdout: string; status: number; stderr: string } {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    cwd,
    env: childEnv(),
  });
  return { stdout: result.stdout, status: result.status ?? 1, stderr: result.stderr };
}

function parseCli(args: string[]): Record<string, unknown> {
  const result = runCli(args);
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function snapshotName(payload: Record<string, unknown>): string {
  return (payload.snapshot as { name: string }).name;
}

function startSession(path: string): SessionClient {
  const client = new SessionClient(path);
  clients.push(client);
  return client;
}

function assertCleanModuleTree(root: string): void {
  if (!existsSync(root)) {
    throw new Error(`missing node_modules at ${root}`);
  }
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      for (const token of MODULE_PATH_TOKENS) {
        expect(full.includes(token), `installed module path contains ${token}: ${full}`).toBe(false);
      }
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        let target = full;
        try {
          target = realpathSync(full);
        } catch {
          continue;
        }
        for (const token of MODULE_PATH_TOKENS) {
          expect(target.includes(token), `module symlink resolves to ${token}: ${target}`).toBe(false);
        }
      } else if (stat.isDirectory()) {
        stack.push(full);
      }
    }
  }
}

function maybeBwrapHomeStatus(): void {
  const version = spawnSync("bwrap", ["--version"], { encoding: "utf8" });
  if (version.status !== 0) {
    return;
  }
  const demos = join(repoRoot, ".project", "demos");
  if (!existsSync(demos)) {
    return;
  }
  const node = process.execPath;
  const args = [
    "--die-with-parent",
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
    "--bind",
    home,
    home,
    "--bind",
    cwd,
    cwd,
    "--ro-bind",
    node,
    node,
    "--tmpfs",
    demos,
    bin,
    "home",
    "status",
  ];
  for (const path of ["/usr", "/bin", "/lib", "/lib64", "/etc"]) {
    if (existsSync(path)) {
      args.unshift("--ro-bind", path, path);
    }
  }
  const result = spawnSync("bwrap", args, { encoding: "utf8", env: childEnv() });
  if (result.status !== 0) {
    return;
  }
  expect(JSON.parse(result.stdout)).toEqual(expect.any(Object));
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
    this.child = spawn(bin, ["document", "session", "--path", path], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env: childEnv(),
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
      new Promise((resolve) => {
        this.exitWaiters.push(resolve);
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
      new Promise((resolve) => {
        this.pending.push(resolve);
      }),
      timeoutMs,
      "timeout waiting for session output",
    );
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
