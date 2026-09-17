import { app, BrowserWindow, ipcMain } from "electron";
import { createConnection, type Socket } from "node:net";
import { createInterface } from "node:readline";
import { join } from "node:path";

import type { Presentation, StudioEvent } from "../session-contract";
import { SessionController } from "./session";

app.commandLine.appendSwitch("ozone-platform-hint", "auto");

type HostWindow = {
  workspaceId: string;
  workspacePath: string;
  window: BrowserWindow;
  session: SessionController;
};

const windows = new Map<string, HostWindow>();
const WINDOW_SHOW_TIMEOUT_MS = 90_000;

type Reply = (message: unknown) => void;

function isHostMode(): boolean {
  return Boolean(process.env.INPAINTER_STUDIO_HOST || process.env.INPAINTER_HOST_CONTROL);
}

function parseControlAddr(value: string): { host: string; port: number } | null {
  const idx = value.lastIndexOf(":");
  if (idx <= 0) {
    return null;
  }
  const host = value.slice(0, idx);
  const port = Number(value.slice(idx + 1));
  if (!host || !Number.isInteger(port) || port <= 0) {
    return null;
  }
  return { host, port };
}

function findWindowByContents(senderId: number): HostWindow | undefined {
  for (const entry of windows.values()) {
    if (!entry.window.isDestroyed() && entry.window.webContents.id === senderId) {
      return entry;
    }
  }
  return undefined;
}

function createWindow(workspaceId: string, workspacePath: string): Promise<BrowserWindow> {
  const session = new SessionController();
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    title: "Inpainter Studio",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const entry: HostWindow = { workspaceId, workspacePath, window: mainWindow, session };
  windows.set(workspaceId, entry);

  const sendPresentation = (presentation: Presentation): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("studio:presentation", presentation);
    }
  };
  const unsubscribe = session.subscribe(sendPresentation);

  mainWindow.on("closed", () => {
    unsubscribe();
    session.dispose();
    if (windows.get(workspaceId)?.window === mainWindow) {
      windows.delete(workspaceId);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`Failed to load ${url}: ${code} ${description}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    console.log(`Studio window ready: ${mainWindow.getTitle()}`);
    sendPresentation(session.getPresentation());
    void session.boot();
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
      reject(new Error("timed out waiting for Studio window to show"));
    }, WINDOW_SHOW_TIMEOUT_MS);

    const onClosed = (): void => {
      clearTimeout(timeout);
      reject(new Error("Studio window closed before it became ready"));
    };

    mainWindow.once("ready-to-show", () => {
      clearTimeout(timeout);
      mainWindow.off("closed", onClosed);
      mainWindow.show();
      mainWindow.focus();
      resolve(mainWindow);
    });

    mainWindow.once("closed", onClosed);
  });
}

async function openWorkspace(workspaceId: string, workspacePath: string): Promise<void> {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }
  const existing = windows.get(workspaceId);
  if (existing && !existing.window.isDestroyed()) {
    if (existing.window.isMinimized()) {
      existing.window.restore();
    }
    existing.window.show();
    existing.window.focus();
    return;
  }
  await createWindow(workspaceId, workspacePath);
}

async function handleCommand(line: string, reply: Reply): Promise<void> {
  let parsed: { cmd?: string; workspaceId?: string; workspacePath?: string };
  try {
    parsed = JSON.parse(line) as { cmd?: string; workspaceId?: string; workspacePath?: string };
  } catch {
    reply({ ok: false, error: `invalid command: ${line}` });
    return;
  }
  if (parsed.cmd === "quit") {
    reply({ ok: true });
    app.quit();
    return;
  }
  if (parsed.cmd === "open") {
    try {
      await openWorkspace(String(parsed.workspaceId ?? ""), String(parsed.workspacePath ?? ""));
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  reply({ ok: false, error: `unknown command: ${parsed.cmd ?? ""}` });
}

function attachHostProtocol(input: NodeJS.ReadableStream, reply: Reply): void {
  const rl = createInterface({ input, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) {
      return;
    }
    void handleCommand(line, reply);
  });
  reply({ status: "ready" });
}

function startStdinHost(): void {
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  attachHostProtocol(process.stdin, (message) => {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  });
  const quit = (): void => {
    app.quit();
  };
  process.stdin.on("end", quit);
  process.stdin.on("close", quit);
}

function startTcpHost(addr: string): void {
  const parsed = parseControlAddr(addr);
  if (!parsed) {
    console.error(`Invalid INPAINTER_HOST_CONTROL: ${addr}`);
    startStdinHost();
    return;
  }

  const tryConnect = (attempt: number): void => {
    const socket: Socket = createConnection({ host: parsed.host, port: parsed.port });
    socket.setEncoding("utf8");
    let attached = false;
    socket.once("connect", () => {
      attached = true;
      attachHostProtocol(socket, (message) => {
        socket.write(`${JSON.stringify(message)}\n`);
      });
    });
    socket.once("error", (err) => {
      if (attached) {
        console.error(`Studio host control error: ${err}`);
        app.quit();
        return;
      }
      socket.destroy();
      if (attempt < 50) {
        setTimeout(() => tryConnect(attempt + 1), 100);
        return;
      }
      console.error(`Studio host control error: ${err}`);
      startStdinHost();
    });
    socket.once("close", () => {
      if (attached) {
        app.quit();
      }
    });
  };

  tryConnect(0);
}

function startHostControl(): void {
  const control = process.env.INPAINTER_HOST_CONTROL;
  if (control) {
    startTcpHost(control);
    return;
  }
  startStdinHost();
}

function registerIpc(): void {
  ipcMain.handle("studio:quit", (event) => {
    if (isHostMode()) {
      const entry = findWindowByContents(event.sender.id);
      if (entry && !entry.window.isDestroyed()) {
        entry.window.close();
      }
      return;
    }
    app.quit();
  });
  ipcMain.handle("studio:dispatch", (event, next: StudioEvent) => {
    const entry = findWindowByContents(event.sender.id);
    return entry?.session.dispatch(next);
  });
  ipcMain.handle("studio:presentation", (event) => {
    const entry = findWindowByContents(event.sender.id);
    return entry?.session.getPresentation();
  });
}

app.whenReady().then(() => {
  registerIpc();

  if (isHostMode()) {
    startHostControl();
    return;
  }

  void createWindow("standalone", "").catch((err) => {
    console.error(err);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow("standalone", "");
    }
  });
});

app.on("window-all-closed", () => {
  if (isHostMode()) {
    return;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
