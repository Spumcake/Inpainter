import type { Helpers, PolicyEvent, PolicyResult } from "@inpainter/policy-runtime";
import type { SessionState } from "../../policy/src/types.ts";

function childScript(state: SessionState): string {
  if (state.feed.child === "chat-assistant") {
    return "feed/chat-assistant";
  }
  return "feed/idle-waiting";
}

export function transition(
  rawState: unknown,
  event: PolicyEvent,
  helpers: Helpers,
): PolicyResult {
  const state = rawState as SessionState;
  if (event.type === "conversation.new") {
    state.feed.child = "idle-waiting";
    return helpers.delegate("feed/chat-assistant", state, event);
  }
  if (event.type === "input.submitted") {
    return helpers.delegate(childScript(state), state, event);
  }
  if (event.type === "present") {
    return helpers.delegate(childScript(state), state, event);
  }
  return helpers.delegate("feed/chat-assistant", state, event);
}
