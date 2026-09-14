import type { SessionState } from "./types.ts";

export function initialize(payload: Record<string, unknown> = {}): SessionState {
  const incomingFeed =
    payload.feed !== null && typeof payload.feed === "object" && !Array.isArray(payload.feed)
      ? (payload.feed as Record<string, unknown>)
      : {};
  return {
    phase: String(payload.phase ?? "boot"),
    skill: String(payload.skill ?? "openai/discuss"),
    directory: String(payload.directory ?? "unsorted"),
    project_title: String(payload.project_title ?? "Workspace"),
    feed: {
      child: incomingFeed.child === "chat-assistant" ? "chat-assistant" : "idle-waiting",
      messages: Array.isArray(incomingFeed.messages) ? [...incomingFeed.messages] : [],
      request_id: Number(incomingFeed.request_id || 0),
    },
  };
}
