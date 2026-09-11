import type { Presentation, StudioEvent } from "../session-contract";

export interface StudioAPI {
  quit: () => Promise<void>;
  dispatch: (event: StudioEvent) => Promise<void>;
  getPresentation: () => Promise<Presentation>;
  subscribe: (listener: (presentation: Presentation) => void) => () => void;
}

declare global {
  interface Window {
    studio: StudioAPI;
  }
}

export {};
