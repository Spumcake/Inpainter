import type { PolicyEvent, PolicyResult } from "@inpainter/policy-runtime";

export function transition(state: unknown, event: PolicyEvent): PolicyResult {
  if (event.type === "schema") {
    return {
      state,
      payload: {
        input: { placeholder: "Press /? for help" },
        submit: { operation: "invoke" },
      },
    };
  }
  return { state, effects: [] };
}
