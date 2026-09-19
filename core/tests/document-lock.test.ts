import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { acquireWriterLock, lockPath, releaseWriterLock } from "../src/operations/documentLock.ts";

const tsx = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/.bin/tsx");
const worker = resolve(dirname(fileURLToPath(import.meta.url)), "lock-acquire-worker.ts");

describe("document writer lock", () => {
  it("allows only one of two simultaneous acquirers to hold the lock", async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const dir = mkdtempSync(join(tmpdir(), "inpainter-lock-race-"));
      const file = join(dir, "project.oreel");
      const go = join(dir, "go");
      const readyA = join(dir, "ready-a");
      const readyB = join(dir, "ready-b");
      const childA = spawnWorker(file, readyA, go);
      const childB = spawnWorker(file, readyB, go);
      await waitForFile(readyA);
      await waitForFile(readyB);
      writeFileSync(go, "go\n");
      const [resultA, resultB] = await Promise.all([readResult(childA), readResult(childB)]);
      const wins = [resultA, resultB].filter((result) => result.ok);
      const losses = [resultA, resultB].filter((result) => !result.ok);
      expect(wins).toHaveLength(1);
      expect(losses).toHaveLength(1);
      expect(String(losses[0].error)).toMatch(/already open for writing/);
      const lock = JSON.parse(readFileSync(lockPath(file), "utf8")) as { holder: string };
      expect(lock.holder).toBe(wins[0].holder);
      releaseWriterLock(file, lock.holder);
      expect(existsSync(lockPath(file))).toBe(false);
    }
  }, 60_000);

  it("replaces a dead-pid lock and then refuses a live holder", () => {
    const dir = mkdtempSync(join(tmpdir(), "inpainter-lock-dead-"));
    const file = join(dir, "project.oreel");
    writeFileSync(
      lockPath(file),
      `${JSON.stringify({
        schemaVersion: 1,
        holder: "dead-holder",
        pid: 2_147_483_647,
        createdAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
      }, null, 2)}\n`,
    );
    const lock = acquireWriterLock(file);
    expect(lock.holder).not.toBe("dead-holder");
    expect(() => acquireWriterLock(file)).toThrow(/already open for writing/);
    releaseWriterLock(file, lock.holder);
  });
});

function spawnWorker(file: string, ready: string, go: string): ChildProcess {
  return spawn(tsx, [worker, file, ready, go], { stdio: ["ignore", "pipe", "pipe"] });
}

function waitForFile(path: string, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolveWait, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (existsSync(path)) {
        clearInterval(timer);
        resolveWait();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timeout waiting for ${path}`));
      }
    }, 10);
  });
}

function readResult(child: ChildProcess): Promise<{ ok: boolean; holder?: string; error?: string }> {
  return new Promise((resolveResult, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", () => {
      try {
        const line = stdout.trim().split("\n").at(-1) ?? "";
        resolveResult(JSON.parse(line) as { ok: boolean; holder?: string; error?: string });
      } catch {
        reject(new Error(`invalid worker output: ${stdout} ${stderr}`));
      }
    });
  });
}
