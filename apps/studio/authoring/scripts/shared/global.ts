import type { Helpers, PolicyEffect, PolicyEvent, PolicyResult } from "@inpainter/policy-runtime";
import type { SessionState } from "../../policy/src/types.ts";

function result(state: SessionState, effects: PolicyEffect[] = []): PolicyResult {
  return { state, effects };
}

function concat(first: PolicyEffect[] = [], second: PolicyEffect[] = []): PolicyEffect[] {
  return [...first, ...second];
}

function present(state: SessionState, helpers: Helpers): PolicyEffect[] {
  const header = helpers.delegate("header", state, { type: "present" });
  const feed = helpers.delegate("feed", state, { type: "present" });
  return concat(header.effects, feed.effects);
}

function fatal(state: SessionState, message: string): PolicyEffect {
  state.feed.child = "fatal";
  state.last_error = message;
  return { type: "ui.fatal", message };
}

function isOpen(state: SessionState): boolean {
  return state.phase === "idle" || state.phase === "working";
}

function isFatal(state: SessionState): boolean {
  return state.phase === "blocked" || state.phase === "signed_out";
}

function eventError(event: PolicyEvent): string {
  return typeof event.error === "string" ? event.error.trim() : "";
}

function blockedMessage(event: PolicyEvent, fallback: string): string {
  return eventError(event) || fallback;
}

function fatalMessage(state: SessionState): string {
  if (state.phase === "signed_out") {
    return "Not authenticated.";
  }
  if (typeof state.last_error === "string" && state.last_error.trim()) {
    return state.last_error.trim();
  }
  return "Studio could not complete the core auth check.";
}

function surface(state: SessionState, helpers: Helpers): PolicyEffect[] {
  if (isFatal(state)) {
    return [fatal(state, fatalMessage(state))];
  }
  if (!isOpen(state)) {
    return [];
  }
  return present(state, helpers);
}

function adopt(child: PolicyResult): { state: SessionState; effects: PolicyEffect[] } {
  const state = child.state as SessionState;
  const effects = child.effects ?? [];
  for (const effect of effects) {
    if (effect.type === "operation.invoke") {
      state.phase = "working";
    }
  }
  return { state, effects };
}

export function transition(
  rawState: unknown,
  event: PolicyEvent,
  helpers: Helpers,
): PolicyResult {
  let state = rawState as SessionState;
  if (event.type === "app.boot") {
    state.phase = "checking";
    return result(state, [{ type: "operation.auth" }]);
  }
  if (event.type === "auth.failed") {
    state.phase = "blocked";
    return result(
      state,
      [fatal(state, blockedMessage(event, "Studio could not run core auth status."))],
    );
  }
  if (event.type === "auth.completed") {
    if (event.state === "unhealthy" || event.crashed) {
      state.phase = "blocked";
      const fallback = event.crashed ? "Core reported a crash." : "Session is unhealthy.";
      return result(state, [fatal(state, blockedMessage(event, fallback))]);
    }
    if (eventError(event) && !event.authenticated) {
      state.phase = "blocked";
      return result(state, [fatal(state, eventError(event))]);
    }
    if (!event.authenticated) {
      state.phase = "signed_out";
      state.last_error = "";
      return result(state, [fatal(state, "Not authenticated.")]);
    }
    state.phase = "idle";
    state.last_error = "";
    return result(state, present(state, helpers));
  }
  if (event.type === "app.quit" || (event.type === "header.action" && event.action === "app.quit")) {
    return result(state, [{ type: "operation.cancel" }, { type: "ui.exit" }]);
  }
  if (event.type === "header.action" && event.action === "conversation.new") {
    if (!isOpen(state)) {
      return result(state, surface(state, helpers));
    }
    state.phase = "idle";
    const feed = adopt(helpers.delegate("feed", state, { type: "conversation.new" }));
    state = feed.state;
    return result(state, concat([{ type: "operation.cancel" }], concat(feed.effects, present(state, helpers))));
  }
  if (event.type === "request.cancel") {
    if (state.phase !== "working") {
      return result(state, surface(state, helpers));
    }
    const feed = adopt(helpers.delegate("feed", state, event));
    state = feed.state;
    state.phase = "idle";
    return result(state, concat([{ type: "operation.cancel" }], concat(feed.effects, present(state, helpers))));
  }
  if (event.type === "request.completed" || event.type === "request.failed") {
    if (state.phase !== "working") {
      return result(state);
    }
    const feed = adopt(helpers.delegate("feed", state, event));
    state = feed.state;
    if (event.request_id === state.feed.request_id) {
      state.phase = "idle";
      return result(state, concat(feed.effects, present(state, helpers)));
    }
    return result(state);
  }
  if (event.type === "input.submitted") {
    if (state.phase !== "idle") {
      return result(state, surface(state, helpers));
    }
    const feed = adopt(helpers.delegate("feed", state, event));
    state = feed.state;
    return result(state, concat(feed.effects, present(state, helpers)));
  }
  return result(state, surface(state, helpers));
}
