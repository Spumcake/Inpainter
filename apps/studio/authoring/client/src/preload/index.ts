import { contextBridge, ipcRenderer } from "electron";

import type { Presentation, StudioEvent } from "../session-contract";

contextBridge.exposeInMainWorld("studio", {
  quit: () => ipcRenderer.invoke("studio:quit"),
  dispatch: (event: StudioEvent) => ipcRenderer.invoke("studio:dispatch", event),
  getPresentation: () => ipcRenderer.invoke("studio:presentation") as Promise<Presentation>,
  subscribe: (listener: (presentation: Presentation) => void) => {
    const handler = (_event: unknown, presentation: Presentation): void => {
      listener(presentation);
    };
    ipcRenderer.on("studio:presentation", handler);
    return () => {
      ipcRenderer.removeListener("studio:presentation", handler);
    };
  },
});
