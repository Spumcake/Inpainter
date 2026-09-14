export type FeedMessage = {
  role: string;
  content?: string;
  text?: string;
};

export type FeedState = {
  child: string;
  messages: FeedMessage[];
  request_id: number;
};

export type SessionState = {
  phase: string;
  skill: string;
  directory: string;
  project_title: string;
  feed: FeedState;
  [key: string]: unknown;
};

export const EFFECTS = [
  "ui.header",
  "ui.feed.show",
  "ui.append",
  "ui.clear",
  "ui.status",
  "ui.fatal",
  "ui.exit",
  "operation.auth",
  "operation.invoke",
  "operation.cancel",
] as const;
