import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { createDocument, openDocument } from "../src/operations/documents.ts";
import { lockFile } from "../src/production/paths.ts";

const tsx = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/.bin/tsx");
const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../src/cli.ts");

const clients: SessionClient[] = [];

afterEach(async () => {
  while (clients.length > 0) {
    const client = clients.pop();
    if (client) {
      await client.dispose();
    }
  }
});

describe("document session", () => {
  it("executes, undoes, redoes, and saves through one process; undo does not survive reopen", { timeout: 15_000 }, async () => {
    const dest = tempDocument("Original");
    const session = startSession(dest);
    const opened = await session.nextJson();
    expect(opened.ok).toBe(true);
    expect(opened.id).toBe("opened");
    expect(snapshotName(opened)).toBe("Original");
    expect(opened.canUndo).toBe(false);

    const renamed = await session.request({
      id: "1",
      op: "execute",
      action: { type: "project/rename", params: { name: "Renamed" } },
    });
    expect(renamed.ok).toBe(true);
    expect(snapshotName(renamed)).toBe("Renamed");
    expect(renamed.canUndo).toBe(true);

    const undone = await session.request({ id: "2", op: "undo" });
    expect(snapshotName(undone)).toBe("Original");
    expect(undone.canRedo).toBe(true);

    const redone = await session.request({ id: "3", op: "redo" });
    expect(snapshotName(redone)).toBe("Renamed");

    const saved = await session.request({ id: "4", op: "save" });
    expect(saved.ok).toBe(true);
    expect((saved.snapshot as { revision: number }).revision).toBe(2);

    const closed = await session.request({ id: "5", op: "close" });
    expect(closed.ok).toBe(true);
    expect(closed.closed).toBe(true);
    expect(await session.waitExit()).toBe(0);

    const openedAgain = parseCli(["document", "open", "--path", dest]);
    expect(openedAgain.name).toBe("Renamed");

    const next = startSession(dest);
    const reopened = await next.nextJson();
    expect(reopened.ok).toBe(true);
    expect(snapshotName(reopened)).toBe("Renamed");
    expect(reopened.canUndo).toBe(false);
    await next.request({ id: "close", op: "close" });
    expect(await next.waitExit()).toBe(0);
  });

  it("rejects a second writer while the first session holds the lock", async () => {
    const dest = tempDocument("Locked");
    const session = startSession(dest);
    await session.nextJson();
    const lockPath = lockFile(join(dest, "project.oreel"));
    expect(existsSync(lockPath)).toBe(true);

    const second = runCli(["document", "session", "--path", dest]);
    expect(second.status).not.toBe(0);
    expect(`${second.stdout}${second.stderr}`).toMatch(/already open for writing/);
    expect(existsSync(lockPath)).toBe(true);

    await session.request({ id: "close", op: "close" });
    expect(await session.waitExit()).toBe(0);
  });

  it("recovers a dead writer pid and can save the last committed content", async () => {
    const dest = tempDocument("Recover");
    const session = startSession(dest);
    await session.nextJson();
    await session.request({
      id: "1",
      op: "execute",
      action: { type: "project/rename", params: { name: "Committed" } },
    });
    await session.request({ id: "2", op: "save" });
    await session.request({
      id: "3",
      op: "execute",
      action: { type: "project/rename", params: { name: "Unsaved" } },
    });

    session.kill("SIGKILL");
    expect(await session.waitExit()).not.toBe(0);
    expect(existsSync(lockFile(join(dest, "project.oreel")))).toBe(true);

    const recovered = startSession(dest);
    const opened = await recovered.nextJson();
    expect(opened.ok).toBe(true);
    expect(snapshotName(opened)).toBe("Committed");
    expect(opened.canUndo).toBe(false);

    const renamed = await recovered.request({
      id: "1",
      op: "execute",
      action: { type: "project/rename", params: { name: "After Recovery" } },
    });
    expect(renamed.ok).toBe(true);
    const saved = await recovered.request({ id: "2", op: "save" });
    expect(saved.ok).toBe(true);
    await recovered.request({ id: "3", op: "close" });
    expect(await recovered.waitExit()).toBe(0);

    expect(openDocument({ path: dest }).name).toBe("After Recovery");
    expect(existsSync(lockFile(join(dest, "project.oreel")))).toBe(false);
  });

  it("refuses a stale save and does not replace the live document", async () => {
    const dest = tempDocument("Base");
    const session = startSession(dest);
    await session.nextJson();
    await session.request({
      id: "1",
      op: "execute",
      action: { type: "project/rename", params: { name: "Working Copy" } },
    });

    const commitPath = join(dest, "project.commit.json");
    const commit = JSON.parse(readFileSync(commitPath, "utf8")) as { revision: number };
    const originalBytes = readFileSync(join(dest, "project.oreel"));
    commit.revision = 9;
    writeFileSync(commitPath, `${JSON.stringify(commit, null, 2)}\n`);

    const failed = await session.request({ id: "2", op: "save" });
    expect(failed.ok).toBe(false);
    expect(String(failed.error)).toMatch(/Save conflict/);

    expect(readFileSync(join(dest, "project.oreel")).equals(originalBytes)).toBe(true);
    expect(openDocument({ path: dest }).name).toBe("Base");

    await session.request({ id: "3", op: "close" });
    expect(await session.waitExit()).toBe(0);
  });

  it("rejects one-shot document save while a session holds the lock", async () => {
    const dest = tempDocument("Busy");
    const session = startSession(dest);
    await session.nextJson();

    const current = parseCli(["document", "open", "--path", dest]);
    const result = runCli(
      ["document", "save", "--path", dest, "--expected-revision", String(current.revision)],
      JSON.stringify({ project: current.project, assets: current.assets }),
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/already open for writing/);

    await session.request({ id: "close", op: "close" });
    expect(await session.waitExit()).toBe(0);
  });
});

function tempDocument(name: string): string {
  const dest = mkdtempSync(join(tmpdir(), "inpainter-session-"));
  createDocument({ path: dest, name });
  return dest;
}

function runCli(args: string[], stdin?: string): { stdout: string; status: number; stderr: string } {
  const result = spawnSync(tsx, [cli, ...args], {
    encoding: "utf8",
    input: stdin,
  });
  return { stdout: result.stdout, status: result.status ?? 1, stderr: result.stderr };
}

function parseCli(args: string[], stdin?: string): Record<string, unknown> {
  const result = runCli(args, stdin);
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

  kill(signal: NodeJS.Signals): void {
    this.child.kill(signal);
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
