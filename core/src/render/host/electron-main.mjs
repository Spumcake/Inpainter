import { app, BrowserWindow } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const jobArg = process.argv.find((arg) => arg.startsWith("--job="));
const persistent = process.argv.includes("--persistent");
if (!jobArg && !persistent) {
  console.error("Missing --job or --persistent");
  process.exit(1);
}
const jobPath = jobArg ? jobArg.slice("--job=".length) : undefined;

function log(message) {
  process.stderr.write(`progress:${JSON.stringify({ progress: 0, phase: message })}\n`);
}

function writeResult(payload) {
  process.stdout.write(`result:${JSON.stringify(payload)}\n`);
}

app.commandLine.appendSwitch("no-sandbox");
app.disableHardwareAcceleration();

app
  .whenReady()
  .then(() => (persistent ? runPersistent() : runOneShot()))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    log(`error:${error instanceof Error ? error.message : String(error)}`);
    if (persistent) {
      writeResult({
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) },
      });
    }
    app.exit(1);
  });

async function createWindow() {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      offscreen: true,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  window.webContents.on("console-message", (_event, _level, message) => {
    process.stderr.write(`${message}\n`);
  });
  window.webContents.on("did-fail-load", (_event, code, desc) => {
    process.stderr.write(`did-fail-load ${code} ${desc}\n`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    process.stderr.write(`render-process-gone ${JSON.stringify(details)}\n`);
  });

  const renderer = pathToFileURL(join(here, "electron-renderer.html")).href;
  log("loading-renderer");
  await window.loadURL(renderer);
  log("renderer-loaded");
  await waitForRunner(window);
  return window;
}

async function waitForRunner(window) {
  log("waiting-runner");
  await window.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (typeof window.__runRenderJob === "function") {
          resolve(true);
          return;
        }
        if (Date.now() - started > 15000) {
          reject(new Error("Renderer script did not register __runRenderJob"));
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
}

async function runJob(window, job) {
  log("running-job");
  let result;
  try {
    result = await window.webContents.executeJavaScript(
      `window.__runRenderJob(${JSON.stringify(job)})`,
    );
  } catch (error) {
    result = {
      success: false,
      error: {
        code: "RENDER_UNAVAILABLE",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
  log(result?.success ? "job-finished" : `job-failed:${result?.error?.message ?? "unknown"}`);
  return result;
}

async function runOneShot() {
  log("ready");
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  const window = await createWindow();
  const result = await runJob(window, job);
  await mkdir(dirname(job.resultPath), { recursive: true });
  await writeFile(job.resultPath, JSON.stringify(result, null, 2), "utf8");
  app.exit(result?.success === false ? 1 : 0);
}

async function runPersistent() {
  const window = await createWindow();
  writeResult({ ready: true });
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let request;
    try {
      request = JSON.parse(trimmed);
    } catch {
      writeResult({ success: false, error: { message: "Persistent job is not valid JSON" } });
      continue;
    }
    if (request?.op === "close") {
      writeResult({ id: request.id, closed: true });
      break;
    }
    const result = await runJob(window, request.job);
    writeResult({ id: request.id, ...result });
  }
  lines.close();
  app.exit(0);
}
