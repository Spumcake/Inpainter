import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("studio", {
  quit: () => ipcRenderer.invoke("studio:quit"),
});
