import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { app } from "electron";

import { createAuthoringPolicy, initialize } from "../../../policy/src/index.ts";
import {
  emptyPresentation,
  type FeedMessage,
  type HeaderAction,
  type Presentation,
  type StudioEffect,
  type StudioEvent,
} from "../session-contract";

type AuthoringPolicy = Awaited<ReturnType<typeof createAuthoringPolicy>>;

function authoringRoot(): string {
  return resolve(__dirname, "../../..");
}

function scriptsDir(): string {
  return resolve(authoringRoot(), "scripts/shared");
}

type CoreLaunch = {
  command: string;
  prefix: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
};

function inpainterHome(): string {
  return process.env.INPAINTER_HOME ? resolve(process.env.INPAINTER_HOME) : join(homedir(), ".inpainter");
}

function envFlag(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return undefined;
}

function useSourceCore(): boolean {
  return envFlag(process.env.INPAINTER_DEV) ?? !app.isPackaged;
}

function findCoreProject(): string {
  if (process.env.INPAINTER_CORE_DIR) {
    const path = resolve(process.env.INPAINTER_CORE_DIR);
    if (existsSync(join(path, "package.json"))) {
      return path;
    }
    throw new Error(`INPAINTER_CORE_DIR does not look like Inpainter core: ${path}`);
  }
  let current = authoringRoot();
  while (true) {
    const candidate = join(current, "core");
    if (existsSync(join(candidate, "package.json"))) {
      return candidate;
    }
    const parent = resolve(current, "..");
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new Error("Could not find Inpainter core source. Set INPAINTER_CORE_DIR.");
}

function sourceCoreLaunch(env: NodeJS.ProcessEnv): CoreLaunch {
  const project = findCoreProject();
  const tsx = resolve(project, "node_modules/.bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const entry = resolve(project, "src/cli.ts");
  if (!existsSync(tsx) || !existsSync(entry)) {
    throw new Error(`Inpainter core source is not ready at ${project}. Run pnpm install in core/.`);
  }
  return { command: tsx, prefix: [entry], cwd: project, env };
}

function coreEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, INPAINTER_HOME: inpainterHome() };
  if (useSourceCore()) {
    env.INPAINTER_DEV = "1";
  }
  return env;
}

function coreLaunch(): CoreLaunch {
  const env = coreEnv();
  if (process.env.INPAINTER_CORE_BIN) {
    return { command: process.env.INPAINTER_CORE_BIN, prefix: [], cwd: process.cwd(), env };
  }
  if (useSourceCore()) {
    return sourceCoreLaunch(env);
  }
  const installed = join(inpainterHome(), "bin", process.platform === "win32" ? "inpainter-core.cmd" : "inpainter-core");
  if (existsSync(installed)) {
    return { command: installed, prefix: [], cwd: process.cwd(), env };
  }
  return sourceCoreLaunch(env);
}

function clip(text: string, max = 2000): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return trimmed.slice(-max);
}

function launchSummary(launch: CoreLaunch, args: string[]): string {
  return `${launch.command} ${[...launch.prefix, ...args].join(" ")} (cwd ${launch.cwd})`;
}

function logStudioCore(lines: string[]): void {
  const body = [`--- studio core ${new Date().toISOString()} ---`, ...lines, ""].join("\n");
  console.error(body);
  try {
    const dir = join(inpainterHome(), "logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "studio-core.log"), `${body}\n`);
  } catch (error) {
    console.error(`Failed to write studio-core.log: ${error}`);
  }
}

export class SessionController {
  private state: Record<string, unknown> = {};
  private presentation: Presentation = emptyPresentation();
  private readonly queue: StudioEvent[] = [];
  private pumping = false;
  private invokeProc: ChildProcessWithoutNullStreams | null = null;
  private invokeGeneration = 0;
  private readonly listeners = new Set<(presentation: Presentation) => void>();
  private policy: AuthoringPolicy | null = null;

  getPresentation(): Presentation {
    return this.presentation;
  }

  subscribe(listener: (presentation: Presentation) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async boot(): Promise<void> {
    await this.ensurePolicy();
    this.state = initialize() as Record<string, unknown>;
    this.presentation = emptyPresentation();
    await this.dispatch({ type: "app.boot" });
  }

  async dispatch(event: StudioEvent): Promise<void> {
    this.queue.push(event);
    await this.pump();
  }

  dispose(): void {
    this.killInvoke();
  }

  private emit(): void {
    const snapshot = this.presentation;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping) {
      return;
    }
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift();
        if (!event) {
          continue;
        }
        const policy = await this.ensurePolicy();
        const result = policy.dispatch(this.state, event);
        if (!result.state || typeof result.state !== "object") {
          throw new Error("Studio policy returned no session state");
        }
        this.state = result.state as Record<string, unknown>;
        this.applyEffects(result.effects ?? []);
        this.emit();
      }
    } catch (error) {
      console.error(error);
      this.presentation = {
        ...this.presentation,
        header: { ...this.presentation.header, actions: [] },
        feed: { ...this.presentation.feed, child: "fatal", submitAvailable: false, working: false },
        fatal: error instanceof Error ? error.message : String(error),
      };
      this.emit();
    } finally {
      this.pumping = false;
      if (this.queue.length > 0) {
        await this.pump();
      }
    }
  }

  private applyEffects(effects: StudioEffect[]): void {
    for (const effect of effects) {
      const kind = String(effect.type);
      if (kind === "ui.header") {
        this.presentation = {
          ...this.presentation,
          header: {
            title: String(effect.title ?? this.presentation.header.title),
            phase: String(effect.phase ?? this.presentation.header.phase),
            actions: asActions(effect.actions),
          },
        };
      } else if (kind === "ui.feed.show") {
        this.presentation = {
          ...this.presentation,
          feed: {
            child: effect.child === "chat-assistant" ? "chat-assistant" : "idle-waiting",
            title: String(effect.title ?? this.presentation.feed.title),
            placeholder: String(effect.placeholder ?? this.presentation.feed.placeholder),
            submitAvailable: Boolean(effect.submit_available),
            notice: String(effect.notice ?? ""),
            messages: asMessages(effect.messages),
            working: Boolean(effect.working),
          },
          fatal: "",
        };
      } else if (kind === "ui.append") {
        const text = String(effect.text ?? "");
        if (text) {
          this.presentation = {
            ...this.presentation,
            feed: {
              ...this.presentation.feed,
              messages: [
                ...this.presentation.feed.messages,
                { role: asRole(effect.role), text },
              ],
            },
          };
        }
      } else if (kind === "ui.clear") {
        this.presentation = {
          ...this.presentation,
          feed: { ...this.presentation.feed, messages: [] },
        };
      } else if (kind === "ui.fatal") {
        this.presentation = {
          ...this.presentation,
          header: { ...this.presentation.header, actions: [] },
          feed: {
            ...this.presentation.feed,
            child: "fatal",
            submitAvailable: false,
            notice: "",
            messages: [],
            working: false,
          },
          fatal: String(effect.message ?? ""),
          status: { text: "", working: false },
        };
      } else if (kind === "ui.status") {
        this.presentation = {
          ...this.presentation,
          status: {
            text: String(effect.text ?? ""),
            working: Boolean(effect.working),
          },
        };
      } else if (kind === "operation.auth") {
        void this.runAuth();
      } else if (kind === "operation.invoke") {
        this.runInvoke(effect);
      } else if (kind === "operation.cancel") {
        this.killInvoke();
      } else if (kind === "ui.exit") {
        app.quit();
      } else {
        throw new Error(`Unsupported client effect: ${kind}`);
      }
    }
  }

  private async ensurePolicy(): Promise<AuthoringPolicy> {
    if (!this.policy) {
      this.policy = await createAuthoringPolicy(scriptsDir());
    }
    return this.policy;
  }

  private async runAuth(): Promise<void> {
    try {
      const payload = await runCore(["auth", "status"]);
      await this.dispatch({ ...payload, type: "auth.completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStudioCore([`auth status failed: ${message}`]);
      await this.dispatch({
        type: "auth.failed",
        error: message,
      });
    }
  }

  private runInvoke(effect: StudioEffect): void {
    this.killInvoke();
    const generation = this.invokeGeneration;
    const requestId = effect.request_id;
    const skill = String(effect.skill ?? "openai/discuss");
    const messages = Array.isArray(effect.messages) ? effect.messages : [];
    const last = messages[messages.length - 1] as { content?: string } | undefined;
    const launch = coreLaunch();
    const proc = spawn(launch.command, [...launch.prefix, "invoke", "--skill", skill], {
      cwd: launch.cwd,
      env: launch.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.invokeProc = proc;
    let stdout = "";
    let stderr = "";
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    proc.on("close", (code) => {
      if (this.invokeProc === proc) {
        this.invokeProc = null;
      }
      if (generation !== this.invokeGeneration) {
        return;
      }
      try {
        const body = JSON.parse(stdout) as { reply?: unknown; error?: unknown };
        if (code || body.error) {
          throw new Error(String(body.error || "Core operation failed"));
        }
        const reply = body.reply;
        if (typeof reply !== "string" || !reply.trim()) {
          throw new Error("The operation returned no reply");
        }
        void this.dispatch({ type: "request.completed", request_id: requestId, reply });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        const reported = message.includes("JSON") ? stderr.slice(-500) || message : message;
        logStudioCore([
          `command: ${launchSummary(launch, ["invoke", "--skill", skill])}`,
          `exit: ${code ?? "null"}`,
          stderr ? `stderr: ${clip(stderr)}` : "stderr: <empty>",
          `invoke failed: ${reported}`,
        ]);
        void this.dispatch({
          type: "request.failed",
          request_id: requestId,
          error: reported,
        });
      }
    });
    proc.stdin.end(
      JSON.stringify({
        messages,
        message: last?.content ?? "",
      }),
    );
  }

  private killInvoke(): void {
    this.invokeGeneration += 1;
    if (this.invokeProc && !this.invokeProc.killed) {
      this.invokeProc.kill();
    }
    this.invokeProc = null;
  }
}

function runCore(args: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const finish = (error: Error | null, value?: Record<string, unknown>) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolvePromise(value ?? {});
    };

    let launch: CoreLaunch;
    try {
      launch = coreLaunch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStudioCore([`command: ${args.join(" ")}`, `failed: ${message}`]);
      finish(error instanceof Error ? error : new Error(message));
      return;
    }

    const summary = launchSummary(launch, args);
    const proc = spawn(launch.command, [...launch.prefix, ...args], {
      cwd: launch.cwd,
      env: launch.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    proc.on("error", (error) => {
      logStudioCore([`command: ${summary}`, `spawn error: ${error.message}`]);
      finish(error);
    });
    proc.on("close", (code) => {
      try {
        const body = JSON.parse(stdout) as Record<string, unknown>;
        logStudioCore([
          `command: ${summary}`,
          `exit: ${code ?? "null"}`,
          stdout ? `stdout: ${clip(stdout)}` : "stdout: <empty>",
          stderr ? `stderr: ${clip(stderr)}` : "stderr: <empty>",
        ]);
        finish(null, body);
      } catch {
        const message = clip(stderr) || "Core returned no valid JSON response";
        logStudioCore([
          `command: ${summary}`,
          `exit: ${code ?? "null"}`,
          stdout ? `stdout: ${clip(stdout)}` : "stdout: <empty>",
          stderr ? `stderr: ${clip(stderr)}` : "stderr: <empty>",
          `failed: ${message}`,
        ]);
        finish(new Error(message));
      }
    });
    proc.stdin.end();
  });
}

function asActions(value: unknown): HeaderAction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const action = item as HeaderAction;
    return { id: String(action.id), available: Boolean(action.available) };
  });
}

function asMessages(value: unknown): FeedMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const message = item as { role?: unknown; text?: unknown; content?: unknown };
    return {
      role: asRole(message.role),
      text: String(message.text ?? message.content ?? ""),
    };
  });
}

function asRole(value: unknown): FeedMessage["role"] {
  if (value === "assistant" || value === "system") {
    return value;
  }
  return "user";
}
