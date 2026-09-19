/**
 * Test-only: if ELECTRON_BINARY is unset, point it at the owned demo Electron
 * checkout so source golden tests can still run. Production resolveElectronBinary
 * never reads this path.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const demoElectron = resolve(
  repoRoot,
  ".project/demos/animation-demo/desktop/node_modules/electron/dist/electron",
);

if (!process.env.ELECTRON_BINARY && existsSync(demoElectron)) {
  process.env.ELECTRON_BINARY = demoElectron;
}
