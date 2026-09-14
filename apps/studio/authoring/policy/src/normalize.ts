import type { PolicyEffect, PolicyResult } from "@inpainter/policy-runtime";
import type { FeedMessage, SessionState } from "./types.ts";

function asList(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  throw new Error("Policy effects must be a list");
}

function asMessageList(value: unknown): FeedMessage[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value as FeedMessage[];
  }
  throw new Error("Conversation messages must be a list");
}

export function normalize(result: PolicyResult): PolicyResult {
  const state = result.state;
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Client policy must return session state");
  }
  const session = state as SessionState;
  const effects = asList(result.effects) as PolicyEffect[];
  for (const effect of effects) {
    if (effect.type === "ui.feed.show" || effect.type === "operation.invoke") {
      effect.messages = asMessageList(effect.messages);
    }
    if (effect.type === "ui.header") {
      effect.actions = asList(effect.actions);
    }
  }
  let feed = session.feed;
  if (feed === null || typeof feed !== "object" || Array.isArray(feed)) {
    feed = { child: "idle-waiting", messages: [], request_id: 0 };
    session.feed = feed;
  }
  feed.messages = asMessageList(feed.messages);
  feed.request_id = Number(feed.request_id || 0);
  if (feed.child !== "idle-waiting" && feed.child !== "chat-assistant" && feed.child !== "fatal") {
    feed.child = "idle-waiting";
  }
  return { state: session, effects };
}
