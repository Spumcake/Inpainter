import { fileURLToPath } from "node:url";

import {
  createRuntime,
  loadScripts,
  type PolicyEvent,
  type PolicyResult,
} from "@inpainter/policy-runtime";

export function defaultScriptsDir(): string {
  return fileURLToPath(new URL("../../scripts", import.meta.url));
}

export async function createCorePolicy(scriptsDir = defaultScriptsDir()) {
  const runtime = createRuntime({
    scripts: await loadScripts(scriptsDir),
  });
  return {
    runtime,
    dispatch(state: unknown, event: PolicyEvent): PolicyResult {
      return runtime.run("global", state, event);
    },
  };
}
