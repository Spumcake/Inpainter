import type { PolicyEvent, PolicyResult } from "@inpainter/policy-runtime";
import type { SessionState } from "../../policy/src/types.ts";

export function transition(rawState: unknown, event: PolicyEvent): PolicyResult {
  const state = rawState as SessionState;
  if (event.type !== "present") {
    return { state, effects: [] };
  }
  const ready = state.phase === "idle" || state.phase === "working";
  return {
    state,
    effects: [
      {
        type: "ui.header",
        title: state.project_title,
        phase: state.phase,
        actions: [
          { id: "conversation.new", available: ready },
          { id: "app.quit", available: true },
        ],
      },
    ],
  };
}
