export interface StudioAPI {
  quit: () => Promise<void>;
}

declare global {
  interface Window {
    studio: StudioAPI;
  }
}

export {};
