import type { PolicyEffect, PolicyEvent, PolicyResult } from "@inpainter/policy-runtime";

export type SessionState = {
  phase: string;
  messages: Array<{ role: string; content: string }>;
  request_id: number;
  skill: string;
  directory: string;
  [key: string]: unknown;
};

function result(state: SessionState, effects: PolicyEffect[] = []): PolicyResult {
  return { state, effects };
}

function note(text: string): PolicyEffect {
  return { type: "ui.append", role: "system", text };
}

function ready(state: SessionState): PolicyEffect {
  state.phase = "idle";
  return { type: "ui.status", text: "", working: false };
}

export function transition(rawState: unknown, event: PolicyEvent): PolicyResult {
  const state = rawState as SessionState;
  if (event.type === "skill.loaded") {
    state.skill = String(event.skill);
    state.messages = [];
    return result(state, [
      { type: "ui.clear" },
      { type: "ui.header" },
      note(`Selected ${event.skill}. Started a new conversation.`),
    ]);
  }
  if (event.type === "app.boot") {
    state.phase = "checking";
    return result(state, [{ type: "operation.auth" }]);
  }
  if (event.type === "auth.failed") {
    state.phase = "blocked";
    return result(state, [{ type: "ui.fatal", message: "Core unavailable." }]);
  }
  if (event.type === "skill.failed") {
    return result(state, [note(String(event.error))]);
  }
  if (event.type === "auth.completed") {
    if (event.state === "unhealthy" || event.crashed) {
      state.phase = "blocked";
      return result(state, [{ type: "ui.fatal", message: "Core unavailable." }]);
    }
    if (!event.authenticated) {
      state.phase = "signed_out";
      return result(state, [{ type: "ui.fatal", message: "Not authenticated." }]);
    }
    state.phase = "idle";
    return result(state, [{ type: "ui.status", text: "", working: false }, { type: "ui.header" }]);
  }
  if (event.type === "app.quit") {
    return result(state, [{ type: "operation.cancel" }, { type: "ui.exit" }]);
  }
  if (event.type === "request.cancel" && state.phase === "working") {
    state.request_id = Number(state.request_id) + 1;
    state.messages.pop();
    return result(state, [
      { type: "operation.cancel" },
      ready(state),
      note("Interrupted. The remote provider may still finish the request."),
    ]);
  }
  if (event.type === "request.completed" || event.type === "request.failed") {
    if (state.phase !== "working" || event.request_id !== state.request_id) {
      return result(state);
    }
    const effects: PolicyEffect[] = [ready(state)];
    if (event.type === "request.completed") {
      state.messages.push({ role: "assistant", content: String(event.reply) });
      effects.push({ type: "ui.append", role: "assistant", text: event.reply });
    } else {
      state.messages.pop();
      effects.push(note(String(event.error)));
    }
    return result(state, effects);
  }
  if (event.type !== "input.submitted") {
    return result(state);
  }
  const text = String(event.text ?? "").trim();
  if (text === "") {
    return result(state);
  }
  if (state.phase === "blocked" || state.phase === "signed_out") {
    return result(state);
  }
  if (text === "/quit" || text === "/exit") {
    return result(state, [{ type: "operation.cancel" }, { type: "ui.exit" }]);
  }
  if (text === "/?" || text === "/help") {
    return result(state, [
      note("/? help · /new clear conversation · /skill [id] · /auth check sign-in · /quit exit · Esc interrupt"),
    ]);
  }
  if (state.phase === "working" || state.phase === "checking") {
    return result(state, [note("Please wait, or press Esc to interrupt a request.")]);
  }
  if (text === "/auth") {
    state.phase = "checking";
    return result(state, [{ type: "operation.auth" }]);
  }
  if (text === "/new") {
    state.messages = [];
    return result(state, [{ type: "ui.clear" }]);
  }
  if (text === "/skill") {
    return result(state, [
      note(`Current skill: ${state.skill}. Use /skill provider/name to select another chat skill.`),
    ]);
  }
  const skillMatch = text.match(/^\/skill\s+(.+)$/);
  if (skillMatch) {
    return result(state, [{ type: "skill.load", skill: skillMatch[1] }]);
  }
  if (text.startsWith("/")) {
    return result(state, [note("Unknown command. Use /? for help.")]);
  }
  if (state.phase !== "idle") {
    return result(state);
  }
  state.phase = "working";
  state.request_id = Number(state.request_id) + 1;
  state.messages.push({ role: "user", content: text });
  return result(state, [
    { type: "ui.append", role: "user", text },
    { type: "ui.status", text: "Working", working: true },
    { type: "layout.submit", request_id: state.request_id, messages: state.messages },
  ]);
}
