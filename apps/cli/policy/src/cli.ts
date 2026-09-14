import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createRuntime, loadScripts, serveStdio } from "@inpainter/policy-runtime";

const scriptsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts");
const runtime = createRuntime({
  scripts: await loadScripts(scriptsDir),
});

serveStdio({ runtime, defaultScript: "global" });
