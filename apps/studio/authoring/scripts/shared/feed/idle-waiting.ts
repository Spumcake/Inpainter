import type { Helpers, PolicyEvent, PolicyResult } from "@inpainter/policy-runtime";
import type { SessionState } from "../../../policy/src/types.ts";

export function transition(
  rawState: unknown,
  event: PolicyEvent,
  helpers: Helpers,
): PolicyResult {
  const state = rawState as SessionState;
  if (event.type === "present") {
    let notice = "";
    if (state.phase === "signed_out") {
      notice = "Signed out. Sign in using the launcher.";
    } else if (state.phase === "blocked") {
      notice = "Core unavailable.";
    } else if (state.phase === "checking") {
      notice = "Checking session…";
    }
    return {
      state,
      effects: [
        {
          type: "ui.feed.show",
          child: "idle-waiting",
          title: state.project_title,
          placeholder: "Ask Inpainter",
          submit_available: state.phase === "idle",
          notice,
          messages: [],
        },
      ],
    };
  }
  if (event.type === "input.submitted") {
    const text = String(event.text ?? "").trim();
    if (text === "" || state.phase !== "idle") {
      return { state, effects: [] };
    }
    state.feed.child = "chat-assistant";
    return helpers.delegate("feed/chat-assistant", state, event);
  }
  return { state, effects: [] };
}
