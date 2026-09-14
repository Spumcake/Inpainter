import type { Helpers, PolicyEvent, PolicyResult } from "@inpainter/policy-runtime";
import type { FeedMessage, SessionState } from "../../../policy/src/types.ts";

function messages(state: SessionState): FeedMessage[] {
  if (!Array.isArray(state.feed.messages)) {
    state.feed.messages = [];
  }
  return state.feed.messages;
}

function history(state: SessionState): FeedMessage[] {
  return messages(state).filter((item) => item.role === "user" || item.role === "assistant");
}

function rendered(state: SessionState): Array<{ role: string; text: unknown }> {
  return messages(state).map((item) => ({ role: item.role, text: item.content }));
}

export function transition(
  rawState: unknown,
  event: PolicyEvent,
  _helpers: Helpers,
): PolicyResult {
  const state = rawState as SessionState;
  if (event.type === "conversation.new") {
    state.feed.messages = [];
    state.feed.request_id = (state.feed.request_id || 0) + 1;
    state.feed.child = "idle-waiting";
    return { state, effects: [{ type: "ui.clear" }] };
  }
  if (event.type === "input.submitted") {
    const text = String(event.text ?? "").trim();
    if (text === "") {
      return { state, effects: [] };
    }
    state.feed.request_id = (state.feed.request_id || 0) + 1;
    messages(state).push({ role: "user", content: text });
    return {
      state,
      effects: [
        { type: "ui.append", role: "user", text },
        { type: "ui.status", text: "Working", working: true },
        {
          type: "operation.invoke",
          request_id: state.feed.request_id,
          skill: state.skill,
          messages: history(state),
        },
      ],
    };
  }
  if (event.type === "request.cancel") {
    state.feed.request_id = (state.feed.request_id || 0) + 1;
    const msgs = messages(state);
    if (msgs.length > 0 && msgs[msgs.length - 1].role === "user") {
      msgs.pop();
    }
    msgs.push({
      role: "system",
      content: "Interrupted. The remote provider may still finish the request.",
    });
    return { state, effects: [{ type: "ui.status", text: "", working: false }] };
  }
  if (event.type === "request.completed" || event.type === "request.failed") {
    if (event.request_id !== state.feed.request_id) {
      return { state, effects: [] };
    }
    if (event.type === "request.completed") {
      messages(state).push({ role: "assistant", content: String(event.reply) });
      return {
        state,
        effects: [
          { type: "ui.append", role: "assistant", text: event.reply },
          { type: "ui.status", text: "", working: false },
        ],
      };
    }
    const msgs = messages(state);
    if (msgs.length > 0 && msgs[msgs.length - 1].role === "user") {
      msgs.pop();
    }
    msgs.push({ role: "system", content: String(event.error || "Request failed") });
    return { state, effects: [{ type: "ui.status", text: "", working: false }] };
  }
  if (event.type === "present") {
    const working = state.phase === "working";
    return {
      state,
      effects: [
        {
          type: "ui.feed.show",
          child: "chat-assistant",
          title: state.project_title,
          placeholder: "Reply or type new prompt...",
          submit_available: state.phase === "idle",
          notice: "",
          messages: rendered(state),
          working,
        },
        { type: "ui.status", text: working ? "Working" : "", working },
      ],
    };
  }
  return { state, effects: [] };
}
