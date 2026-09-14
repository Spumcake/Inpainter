import { describe, expect, it } from "vitest";
import { transition } from "../../scripts/global.ts";
import { transition as layout } from "../../scripts/layouts/chat-assistant.ts";
import type { SessionState } from "../../scripts/global.ts";

function fresh(): SessionState {
  return {
    phase: "boot",
    messages: [],
    request_id: 0,
    skill: "openai/discuss",
    directory: "unsorted",
  };
}

describe("cli layout", () => {
  it("declares the chat-assistant schema", () => {
    const result = layout(null, { type: "schema" });
    expect(result.payload).toEqual({
      input: { placeholder: "Press /? for help" },
      submit: { operation: "invoke" },
    });
  });
});

describe("cli session policy", () => {
  it("boots into checking and requests auth", () => {
    const state = fresh();
    const result = transition(state, { type: "app.boot" });
    expect(result.state).toMatchObject({ phase: "checking" });
    expect(result.effects?.map((effect) => effect.type)).toEqual(["operation.auth"]);
  });

  it("retains request identity and ignores a stale completion", () => {
    const state = fresh();
    transition(state, { type: "app.boot" });
    transition(state, { type: "auth.completed", authenticated: true });
    transition(state, { type: "input.submitted", text: "Hello" });
    const old = state.request_id;
    expect(state.phase).toBe("working");
    transition(state, { type: "request.cancel" });
    transition(state, { type: "request.completed", request_id: old, reply: "late" });
    expect(state.phase).toBe("idle");
    expect(state.messages).toEqual([]);
  });

  it("submits, records history, and recovers from a failed request", () => {
    const state = fresh();
    transition(state, { type: "app.boot" });
    transition(state, { type: "auth.completed", authenticated: true });
    const first = transition(state, { type: "input.submitted", text: "Hello" });
    expect(first.effects?.some((effect) => effect.type === "layout.submit")).toBe(true);
    transition(state, {
      type: "request.completed",
      request_id: state.request_id,
      reply: "A real test reply",
    });
    transition(state, { type: "input.submitted", text: "Follow up" });
    const failed = transition(state, {
      type: "request.failed",
      request_id: state.request_id,
      error: "service unavailable",
    });
    expect(failed.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "ui.append", role: "system", text: "service unavailable" }),
      ]),
    );
    expect(state.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    transition(state, { type: "input.submitted", text: "Try again" });
    expect(state.messages).toHaveLength(3);
    transition(state, {
      type: "request.completed",
      request_id: state.request_id,
      reply: "Recovered",
    });
    expect(state.messages).toHaveLength(4);
    transition(state, { type: "input.submitted", text: "/new" });
    expect(state.messages).toEqual([]);
  });

  it("treats signed-out as a fatal message", () => {
    const state = fresh();
    transition(state, { type: "app.boot" });
    const signedOut = transition(state, { type: "auth.completed", authenticated: false });
    expect(state.phase).toBe("signed_out");
    expect(signedOut.effects).toEqual([{ type: "ui.fatal", message: "Not authenticated." }]);
    const ignored = transition(state, { type: "input.submitted", text: "hello" });
    expect(ignored.effects).toEqual([]);
    expect(state.phase).toBe("signed_out");
  });

  it("treats an unhealthy core as a fatal message", () => {
    const state = fresh();
    transition(state, { type: "app.boot" });
    const blocked = transition(state, { type: "auth.completed", crashed: true });
    expect(state.phase).toBe("blocked");
    expect(blocked.effects).toEqual([{ type: "ui.fatal", message: "Core unavailable." }]);
  });
});
