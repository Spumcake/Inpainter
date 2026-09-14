export type StudioEvent = {
  type: string;
  [key: string]: unknown;
};

export type HeaderAction = {
  id: string;
  available: boolean;
};

export type FeedMessage = {
  role: "user" | "assistant" | "system";
  text: string;
};

export type Presentation = {
  header: {
    title: string;
    phase: string;
    actions: HeaderAction[];
  };
  feed: {
    child: "none" | "idle-waiting" | "chat-assistant" | "fatal";
    title: string;
    placeholder: string;
    submitAvailable: boolean;
    notice: string;
    messages: FeedMessage[];
    working: boolean;
  };
  fatal: string;
  status: {
    text: string;
    working: boolean;
  };
};

export type StudioEffect = {
  type: string;
  [key: string]: unknown;
};

export function emptyPresentation(): Presentation {
  return {
    header: { title: "Workspace", phase: "boot", actions: [] },
    feed: {
      child: "none",
      title: "Workspace",
      placeholder: "Ask Inpainter",
      submitAvailable: false,
      notice: "",
      messages: [],
      working: false,
    },
    fatal: "",
    status: { text: "", working: false },
  };
}
