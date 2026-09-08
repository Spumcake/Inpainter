import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";

app.commandLine.appendSwitch("ozone-platform-hint", "auto");

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

function focusStudioWindow(): void {
  const existing = BrowserWindow.getAllWindows()[0];
  if (!existing) {
    createWindow();
    return;
  }
  if (existing.isMinimized()) {
    existing.restore();
  }
  existing.show();
  existing.focus();
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    title: "Inpainter Studio",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`Failed to load ${url}: ${code} ${description}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    console.log(`Studio window ready: ${mainWindow.getTitle()}`);
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

if (gotTheLock) {
  app.on("second-instance", () => {
    focusStudioWindow();
  });

  app.whenReady().then(() => {
    ipcMain.handle("studio:quit", () => {
      app.quit();
    });

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
