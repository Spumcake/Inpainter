import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

import { CoreError } from "../errors.ts";
import { openEditSession, type EditSession, type EditState } from "./edits.ts";
import type { PlaybackController } from "./playback.ts";

type SessionRequest = {
  id: string;
  op: string;
  action?: { type: string; params?: Record<string, unknown>; id?: string };
  times?: number[];
  time?: number;
  source?: string;
  ms?: number;
};

type SessionControl = {
  cancelled: boolean;
};

export async function runDocumentSession(input: { path: string }): Promise<void> {
  const session = openEditSession({ path: input.path });
  let playback: PlaybackController | undefined;
  let starting: Promise<void> | undefined;
  writeLine({ id: "opened", ok: true, ...statePayload(session.inspect()) });
  const lines = createInterface({ input: stdin, crlfDelay: Infinity });
  let fatal = false;
  let closed = false;
  let pumping = false;
  const queue: SessionRequest[] = [];
  let inflight: { request: SessionRequest; control: SessionControl } | null = null;
  let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const finish = (): void => {
    closed = true;
    const settle = resolveDone;
    resolveDone = undefined;
    settle?.();
  };

  const ensurePlayback = async (source?: string): Promise<PlaybackController> => {
    if (!playback) {
      starting ??= (async () => {
        const { RealtimeClock, openPlayback } = await import("./playback.ts");
        playback = await openPlayback({ session, clock: new RealtimeClock(), source });
      })();
      await starting;
      starting = undefined;
    } else if (source !== undefined) {
      playback.setSource(source);
    }
    if (!playback) {
      throw new CoreError("Playback failed to start");
    }
    if (closed) {
      throw new CoreError("cancelled");
    }
    return playback;
  };

  const writeError = (id: string, error: unknown): void => {
    const message = error instanceof CoreError ? error.message : String(error);
    writeLine({ id, ok: false, error: message });
    if (message.startsWith("Writer lock was lost")) {
      fatal = true;
      process.exitCode = 1;
      finish();
    }
  };

  const cancelInflight = (): void => {
    if (!inflight || inflight.control.cancelled) {
      return;
    }
    inflight.control.cancelled = true;
    playback?.stop();
    writeLine({ id: inflight.request.id, ok: false, error: "cancelled" });
  };

  const cancelQueuedWork = (): void => {
    const kept: SessionRequest[] = [];
    for (const request of queue) {
      if (request.op === "render" || request.op === "advance") {
        writeLine({ id: request.id, ok: false, error: "cancelled" });
      } else {
        kept.push(request);
      }
    }
    queue.length = 0;
    queue.push(...kept);
  };

  const isHostOp = (op: string): boolean => op === "render" || op === "advance";

  const handleStop = (request: SessionRequest): void => {
    if (inflight && isHostOp(inflight.request.op)) {
      cancelInflight();
    }
    cancelQueuedWork();
    try {
      if (!playback) {
        writeLine({
          id: request.id,
          ok: true,
          ...statePayload(session.inspect()),
          playhead: 0,
          isPlaying: false,
          requestGeneration: 0,
          frames: [],
        });
        return;
      }
      writeLine({ id: request.id, ok: true, ...playbackPayload(session, playback.stop()) });
    } catch (error) {
      writeError(request.id, error);
    }
  };

  const releaseStdin = (): void => {
    lines.close();
    stdin.pause();
    stdin.unref();
  };

  const handleCloseNow = (request: SessionRequest): void => {
    try {
      playback?.stop();
      const handle = session.handle;
      session.close();
      writeLine({ id: request.id, ok: true, closed: true, handle });
      releaseStdin();
      finish();
    } catch (error) {
      writeError(request.id, error);
    }
  };

  const pump = async (): Promise<void> => {
    if (pumping) {
      return;
    }
    pumping = true;
    try {
      while (!closed && queue.length > 0) {
        const request = queue.shift();
        if (!request) {
          break;
        }
        const control = { cancelled: false };
        inflight = { request, control };
        try {
          const payload = await handleRequest(session, request, ensurePlayback, control);
          if (!control.cancelled && !closed) {
            writeLine({ id: request.id, ok: true, ...payload });
            if (request.op === "close") {
              releaseStdin();
              finish();
            }
          }
        } catch (error) {
          if (!control.cancelled && !closed) {
            writeError(request.id, error);
          }
        }
        inflight = null;
      }
    } finally {
      pumping = false;
      if (closed) {
        resolveDone?.();
      }
    }
  };

  const onLine = (line: string): void => {
    if (closed) {
      return;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    let id = "unknown";
    try {
      const request = parseRequest(trimmed);
      id = request.id;
      if (request.op === "stop") {
        handleStop(request);
        return;
      }
      if (request.op === "close") {
        if (inflight && isHostOp(inflight.request.op)) {
          cancelInflight();
        }
        cancelQueuedWork();
        const waitingOnEdit = Boolean(inflight && !isHostOp(inflight.request.op));
        if (waitingOnEdit || queue.length > 0) {
          queue.push(request);
          void pump();
          return;
        }
        handleCloseNow(request);
        return;
      }
      queue.push(request);
      void pump();
    } catch (error) {
      writeError(id, error);
    }
  };

  lines.on("line", onLine);
  lines.on("close", () => {
    finish();
  });

  await done;
  releaseStdin();
  await starting?.catch(() => undefined);
  await playback?.dispose();
  session.close();
  if (fatal) {
    process.exitCode = 1;
  }
}

async function handleRequest(
  session: EditSession,
  request: SessionRequest,
  ensurePlayback: (source?: string) => Promise<PlaybackController>,
  control: SessionControl,
): Promise<Record<string, unknown>> {
  switch (request.op) {
    case "query":
      return statePayload(session.inspect());
    case "execute": {
      if (!request.action || typeof request.action.type !== "string") {
        throw new CoreError("execute requires an action object with type");
      }
      return statePayload(session.execute(request.action));
    }
    case "undo":
      return statePayload(session.undo());
    case "redo":
      return statePayload(session.redo());
    case "save":
      return statePayload(session.save());
    case "render": {
      const times = request.times;
      if (!Array.isArray(times) || times.length === 0) {
        throw new CoreError("render requires times");
      }
      const playback = await ensurePlayback(request.source);
      throwIfCancelled(control);
      const frames = await playback.renderTimes(times);
      throwIfCancelled(control);
      return { ...statePayload(session.inspect()), ...playback.inspect(), frames };
    }
    case "play":
      return playbackPayload(session, (await ensurePlayback(request.source)).play());
    case "pause":
      return playbackPayload(session, (await ensurePlayback(request.source)).pause());
    case "seek": {
      if (typeof request.time !== "number" || !Number.isFinite(request.time)) {
        throw new CoreError("seek requires a finite time");
      }
      return playbackPayload(session, (await ensurePlayback(request.source)).seek(request.time));
    }
    case "stop":
      return playbackPayload(session, (await ensurePlayback()).stop());
    case "advance": {
      if (typeof request.ms !== "number" || !Number.isFinite(request.ms)) {
        throw new CoreError("advance requires a finite ms");
      }
      const playback = await ensurePlayback(request.source);
      throwIfCancelled(control);
      const advanced = await playback.advance(request.ms);
      throwIfCancelled(control);
      return playbackPayload(session, advanced);
    }
    case "close": {
      const handle = session.handle;
      session.close();
      return { closed: true, handle };
    }
    default:
      throw new CoreError(`Unknown session op: ${request.op}`);
  }
}

function throwIfCancelled(control: SessionControl): void {
  if (control.cancelled) {
    throw new CoreError("cancelled");
  }
}

function playbackPayload(
  session: EditSession,
  playback: {
    playhead: number;
    isPlaying: boolean;
    requestGeneration: number;
    generation: number;
    frames: unknown[];
    lastFrame?: unknown;
    pid?: number;
  },
): Record<string, unknown> {
  return {
    ...statePayload(session.inspect()),
    playhead: playback.playhead,
    isPlaying: playback.isPlaying,
    requestGeneration: playback.requestGeneration,
    frames: playback.frames,
    lastFrame: playback.lastFrame,
    pid: playback.pid,
  };
}

function parseRequest(line: string): SessionRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    throw new CoreError("Session request is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CoreError("Session request must be an object");
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) {
    throw new CoreError("Session request id is required");
  }
  if (typeof record.op !== "string" || !record.op) {
    throw new CoreError("Session request op is required");
  }
  const action = record.action;
  if (action !== undefined && (action === null || typeof action !== "object" || Array.isArray(action))) {
    throw new CoreError("Session request action must be an object");
  }
  const times = record.times;
  if (times !== undefined && (!Array.isArray(times) || times.some((time) => typeof time !== "number"))) {
    throw new CoreError("Session request times must be an array of numbers");
  }
  return {
    id: record.id,
    op: record.op,
    action: action as SessionRequest["action"],
    times: times as number[] | undefined,
    time: typeof record.time === "number" ? record.time : undefined,
    source: typeof record.source === "string" ? record.source : undefined,
    ms: typeof record.ms === "number" ? record.ms : undefined,
  };
}

function statePayload(state: EditState): Record<string, unknown> {
  return {
    handle: state.handle,
    snapshot: state.snapshot,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    history: state.history,
    generation: state.generation,
  };
}

function writeLine(payload: Record<string, unknown>): void {
  stdout.write(`${JSON.stringify(payload)}\n`);
}
