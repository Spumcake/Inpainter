import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { StudioEffect } from "../session-contract";

export type HostResponse = {
  id: number;
  ok: boolean;
  state?: Record<string, unknown>;
  effects?: StudioEffect[];
  error?: string;
};

type Pending = {
  resolve: (value: HostResponse) => void;
  reject: (error: Error) => void;
};

export class LuaHost {
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private buffer = "";

  private constructor(private readonly proc: ChildProcessWithoutNullStreams) {
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.onData(chunk));
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk: string) => {
      console.error(chunk.trimEnd());
    });
    this.proc.on("exit", (code) => {
      const error = new Error(`Studio Lua host exited (${code ?? "unknown"})`);
      for (const item of this.pending.values()) {
        item.reject(error);
      }
      this.pending.clear();
    });
  }

  static start(python: string): LuaHost {
    const proc = spawn(python, ["-u", "-m", "studio_host"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return new LuaHost(proc);
  }

  request(payload: Record<string, unknown>): Promise<HostResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
    });
  }

  dispose(): void {
    if (!this.proc.killed) {
      this.proc.kill();
    }
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) {
        this.onLine(line);
      }
      index = this.buffer.indexOf("\n");
    }
  }

  private onLine(line: string): void {
    let response: HostResponse;
    try {
      response = JSON.parse(line) as HostResponse;
    } catch {
      console.error("Studio Lua host returned invalid JSON");
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    this.pending.delete(response.id);
    if (!response.ok) {
      pending.reject(new Error(response.error || "Studio Lua host failed"));
      return;
    }
    pending.resolve(response);
  }
}
