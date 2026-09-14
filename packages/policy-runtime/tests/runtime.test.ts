import { describe, expect, it } from "vitest";
import { PolicyError, createRuntime } from "../src/runtime.ts";
import { handle } from "../src/stdio.ts";

/**
 * Host-mechanics fixtures captured from studio_host/runtime.py:
 * unknown scripts, depth > 8, unsupported effects, and non-object results fail.
 * Unknown events are not rejected; Lua passed them through.
 */
describe("policy runtime", () => {
  it("runs a named script and returns its state and effects", () => {
    const runtime = createRuntime({
      scripts: {
        global: (state) => ({
          state,
          effects: [{ type: "ui.status", text: "ok" }],
        }),
      },
    });
    const result = runtime.run("global", { phase: "idle" }, { type: "app.boot" });
    expect(result.state).toEqual({ phase: "idle" });
    expect(result.effects).toEqual([{ type: "ui.status", text: "ok" }]);
  });

  it("rejects unknown scripts", () => {
    const runtime = createRuntime({ scripts: { global: (state) => ({ state }) } });
    expect(() => runtime.run("missing", {}, { type: "present" })).toThrow(
      /unknown policy script: missing/,
    );
  });

  it("rejects unsupported effects when a whitelist is configured", () => {
    const runtime = createRuntime({
      scripts: {
        global: (state) => ({
          state,
          effects: [{ type: "ui.explode" }],
        }),
      },
      effects: ["ui.status"],
    });
    expect(() => runtime.run("global", {}, { type: "present" })).toThrow(
      /unsupported client effect/,
    );
  });

  it("rejects a non-list effects value", () => {
    const runtime = createRuntime({
      scripts: {
        global: (state) => ({ state, effects: { type: "ui.status" } as never }),
      },
    });
    expect(() => runtime.run("global", {}, { type: "present" })).toThrow(
      /Policy effects must be a list/,
    );
  });

  it("rejects a non-object transition result", () => {
    const runtime = createRuntime({
      scripts: { global: () => "nope" as never },
    });
    expect(() => runtime.run("global", {}, { type: "present" })).toThrow(
      /must return an object/,
    );
  });

  it("enforces the depth-8 delegate guard", () => {
    const runtime = createRuntime({
      scripts: {
        nest: (_state, _event, helpers) => helpers.delegate("nest", {}, { type: "present" }),
      },
    });
    expect(() => runtime.run("nest", {}, { type: "present" })).toThrow(
      /delegate depth exceeded/,
    );
  });

  it("allows eight nested delegates", () => {
    let deepest = 0;
    const runtime = createRuntime({
      scripts: {
        nest: (state, event, helpers) => {
          const depth = Number((state as { depth?: number }).depth ?? 0);
          deepest = Math.max(deepest, depth);
          if (depth >= 8) {
            return { state, effects: [] };
          }
          return helpers.delegate("nest", { depth: depth + 1 }, event);
        },
      },
    });
    const result = runtime.run("nest", { depth: 0 }, { type: "present" });
    expect(deepest).toBe(8);
    expect((result.state as { depth: number }).depth).toBe(8);
  });

  it("coerces a non-object delegate state to an empty object", () => {
    const runtime = createRuntime({
      scripts: {
        parent: (_state, _event, helpers) => helpers.delegate("child", "nope", { type: "present" }),
        child: (state) => ({ state, effects: [] }),
      },
    });
    const result = runtime.run("parent", {}, { type: "present" });
    expect(result.state).toEqual({});
  });
});

describe("stdio handle", () => {
  const runtime = createRuntime({
    scripts: {
      global: (state, event) => ({
        state: { ...(state as object), phase: "idle" },
        effects: [{ type: "operation.auth" }],
        payload: { echoed: (event as { type: string }).type },
      }),
    },
  });
  const host = {
    runtime,
    defaultScript: "global",
    initialize: () => ({ phase: "boot" }),
  };

  it("returns initialized state", () => {
    expect(handle(host, { id: 1, op: "init" })).toEqual({ state: { phase: "boot" } });
  });

  it("runs the default script for a transition", () => {
    const result = handle(host, {
      id: 2,
      op: "transition",
      state: { phase: "checking" },
      event: { type: "app.boot" },
    });
    expect(result.state).toEqual({ phase: "idle" });
    expect(result.effects).toEqual([{ type: "operation.auth" }]);
    expect(result.payload).toEqual({ echoed: "app.boot" });
  });

  it("rejects unknown operations", () => {
    expect(() => handle(host, { op: "explode" })).toThrow(PolicyError);
    expect(() => handle(host, { op: "explode" })).toThrow(/unknown host operation/);
  });
});
