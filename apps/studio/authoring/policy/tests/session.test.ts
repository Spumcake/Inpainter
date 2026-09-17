import { describe, expect, it } from "vitest";
import { PolicyError } from "@inpainter/policy-runtime";
import { createAuthoringPolicy, defaultScriptsDir, initialize } from "../src/index.ts";

const { dispatch, runtime } = await createAuthoringPolicy(defaultScriptsDir());

function boot(authenticated = true, extra: Record<string, unknown> = {}) {
  let state = initialize();
  state = dispatch(state, { type: "app.boot" }).state as ReturnType<typeof initialize>;
  const result = dispatch(state, { type: "auth.completed", authenticated, ...extra });
  return { state: result.state as ReturnType<typeof initialize>, effects: result.effects ?? [] };
}

function effect(effects: Array<{ type: string; [key: string]: unknown }>, kind: string) {
  return effects.find((item) => item.type === kind) as { type: string; [key: string]: unknown };
}

describe("studio session policy", () => {
  it("boots into idle-waiting when authenticated", () => {
    const { state, effects } = boot(true);
    expect(state.phase).toBe("idle");
    expect(state.feed.child).toBe("idle-waiting");
    expect(effect(effects, "ui.feed.show").child).toBe("idle-waiting");
    expect(effect(effects, "ui.header").title).toBe("Workspace");
    expect(effect(effects, "ui.feed.show").submit_available).toBe(true);
  });

  it("does not present the working UI until auth completes", () => {
    const state = initialize();
    const result = dispatch(state, { type: "app.boot" });
    expect(result.state).toMatchObject({ phase: "checking" });
    expect(result.effects?.map((item) => item.type)).toEqual(["operation.auth"]);
  });

  it("treats signed-out as a fatal message", () => {
    const { state, effects } = boot(false);
    expect(state.phase).toBe("signed_out");
    expect(state.feed.child).toBe("fatal");
    expect(effect(effects, "ui.fatal").message).toBe("Not authenticated.");
    expect(effects.some((item) => item.type === "ui.feed.show")).toBe(false);
    const result = dispatch(state, { type: "input.submitted", text: "Hello" });
    const next = result.state as ReturnType<typeof initialize>;
    expect(next.phase).toBe("signed_out");
    expect(next.feed.child).toBe("fatal");
    expect(next.feed.messages).toEqual([]);
  });

  it("treats a core crash as a fatal message with the reported error", () => {
    const { state, effects } = boot(true, { crashed: true, error: "boom" });
    expect(state.phase).toBe("blocked");
    expect(effect(effects, "ui.fatal").message).toBe("boom");
    expect(effects.some((item) => item.type === "ui.feed.show")).toBe(false);
  });

  it("treats an unhealthy session as the session error, not a missing core", () => {
    const { state, effects } = boot(false, {
      state: "unhealthy",
      error: "refresh failed: invalid grant",
    });
    expect(state.phase).toBe("blocked");
    expect(effect(effects, "ui.fatal").message).toBe("refresh failed: invalid grant");
  });

  it("surfaces the spawn error when Studio cannot run auth status", () => {
    let state = initialize();
    state = dispatch(state, { type: "app.boot" }).state as ReturnType<typeof initialize>;
    const result = dispatch(state, {
      type: "auth.failed",
      error: "INPAINTER_CORE_DIR does not look like Inpainter core: /tmp",
    });
    expect(result.state).toMatchObject({ phase: "blocked" });
    expect(effect(result.effects ?? [], "ui.fatal").message).toBe(
      "INPAINTER_CORE_DIR does not look like Inpainter core: /tmp",
    );
  });

  it("switches to chat and invokes on submit", () => {
    const { state } = boot(true);
    const result = dispatch(state, { type: "input.submitted", text: "Hello" });
    const next = result.state as ReturnType<typeof initialize>;
    const effects = result.effects ?? [];
    expect(next.phase).toBe("working");
    expect(next.feed.child).toBe("chat-assistant");
    expect(next.feed.messages[0].content).toBe("Hello");
    expect(effect(effects, "ui.feed.show").child).toBe("chat-assistant");
    const invoke = effect(effects, "operation.invoke");
    expect(invoke.request_id).toBe(next.feed.request_id);
    expect(invoke.skill).toBe("openai/discuss");
    expect((invoke.messages as Array<{ content: string }>)[0].content).toBe("Hello");
  });

  it("appends an assistant reply and keeps chat", () => {
    const { state } = boot(true);
    let next = dispatch(state, { type: "input.submitted", text: "Hello" }).state as ReturnType<
      typeof initialize
    >;
    const requestId = next.feed.request_id;
    next = dispatch(next, {
      type: "request.completed",
      request_id: requestId,
      reply: "Hi there",
    }).state as ReturnType<typeof initialize>;
    expect(next.phase).toBe("idle");
    expect(next.feed.child).toBe("chat-assistant");
    expect(next.feed.messages.map((item) => item.role)).toEqual(["user", "assistant"]);
    expect(next.feed.messages[1].content).toBe("Hi there");
  });

  it("ignores a stale completion after cancel", () => {
    const { state } = boot(true);
    let next = dispatch(state, { type: "input.submitted", text: "Hello" }).state as ReturnType<
      typeof initialize
    >;
    const old = next.feed.request_id;
    next = dispatch(next, { type: "request.cancel" }).state as ReturnType<typeof initialize>;
    const result = dispatch(next, {
      type: "request.completed",
      request_id: old,
      reply: "late",
    });
    const after = result.state as ReturnType<typeof initialize>;
    expect(after.phase).toBe("idle");
    expect(after.feed.messages.some((item) => item.role === "assistant")).toBe(false);
  });

  it("keeps the conversation after failure and retry", () => {
    const { state } = boot(true);
    let next = dispatch(state, { type: "input.submitted", text: "Hello" }).state as ReturnType<
      typeof initialize
    >;
    next = dispatch(next, {
      type: "request.failed",
      request_id: next.feed.request_id,
      error: "service unavailable",
    }).state as ReturnType<typeof initialize>;
    expect(next.phase).toBe("idle");
    expect(next.feed.child).toBe("chat-assistant");
    expect(next.feed.messages.at(-1)?.role).toBe("system");
    const result = dispatch(next, { type: "input.submitted", text: "Try again" });
    const retry = result.state as ReturnType<typeof initialize>;
    expect(retry.phase).toBe("working");
    expect(retry.feed.messages.at(-1)?.content).toBe("Try again");
    expect(
      (effect(result.effects ?? [], "operation.invoke").messages as Array<{ role: string }>).map(
        (item) => item.role,
      ),
    ).toEqual(["user"]);
  });

  it("includes history on the second request", () => {
    const { state } = boot(true);
    let next = dispatch(state, { type: "input.submitted", text: "Hello" }).state as ReturnType<
      typeof initialize
    >;
    next = dispatch(next, {
      type: "request.completed",
      request_id: next.feed.request_id,
      reply: "Hi",
    }).state as ReturnType<typeof initialize>;
    const result = dispatch(next, { type: "input.submitted", text: "Follow up" });
    const roles = (
      effect(result.effects ?? [], "operation.invoke").messages as Array<{ role: string }>
    ).map((item) => item.role);
    expect(roles).toEqual(["user", "assistant", "user"]);
  });

  it("returns to idle-waiting on a new conversation", () => {
    const { state } = boot(true);
    let next = dispatch(state, { type: "input.submitted", text: "Hello" }).state as ReturnType<
      typeof initialize
    >;
    next = dispatch(next, {
      type: "request.completed",
      request_id: next.feed.request_id,
      reply: "Hi",
    }).state as ReturnType<typeof initialize>;
    const result = dispatch(next, { type: "header.action", action: "conversation.new" });
    const after = result.state as ReturnType<typeof initialize>;
    expect(after.feed.child).toBe("idle-waiting");
    expect(after.feed.messages).toEqual([]);
    expect(effect(result.effects ?? [], "ui.feed.show").child).toBe("idle-waiting");
    expect((result.effects ?? []).some((item) => item.type === "operation.cancel")).toBe(true);
  });

  it("rejects an unknown script and an unsupported effect", () => {
    expect(() => runtime.run("missing", initialize(), { type: "present" })).toThrow(
      /unknown policy script/,
    );
    expect(() => runtime.run("missing", initialize(), { type: "present" })).toThrow(PolicyError);
  });
});
