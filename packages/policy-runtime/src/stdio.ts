import { writeSync } from "node:fs";
import { createInterface } from "node:readline";

import { PolicyError, type PolicyResult, type PolicyRuntime } from "./runtime.ts";

export type StdioHost = {
  runtime: PolicyRuntime;
  defaultScript: string;
  initialize?: () => unknown;
};

type HostRequest = {
  id?: number;
  op?: string;
  script?: string;
  state?: unknown;
  event?: unknown;
};

export function serveStdio(host: StdioHost): void {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    let request: HostRequest;
    try {
      request = JSON.parse(trimmed) as HostRequest;
    } catch {
      write({ ok: false, error: "invalid JSON request" });
      return;
    }
    try {
      write({ id: request.id, ok: true, ...handle(host, request) });
    } catch (error) {
      write({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  rl.on("close", () => {
    process.exit(0);
  });
}

export function handle(
  host: StdioHost,
  request: HostRequest,
): { state?: unknown; effects?: unknown; payload?: unknown } {
  const op = request.op;
  if (op === "init") {
    if (!host.initialize) {
      throw new PolicyError("init is not supported by this policy host");
    }
    return { state: host.initialize() };
  }
  if (op === "transition") {
    const script = typeof request.script === "string" && request.script
      ? request.script
      : host.defaultScript;
    const result: PolicyResult = host.runtime.run(script, request.state, request.event);
    return {
      state: result.state,
      effects: result.effects ?? [],
      payload: result.payload ?? {},
    };
  }
  throw new PolicyError(`unknown host operation: ${op}`);
}

function write(payload: Record<string, unknown>): void {
  writeSync(1, `${JSON.stringify(payload)}\n`);
}
