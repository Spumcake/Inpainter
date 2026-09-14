import { fileURLToPath } from "node:url";

import {
  createRuntime,
  loadScripts,
  type PolicyEvent,
  type PolicyResult,
} from "@inpainter/policy-runtime";

import { normalize } from "./normalize.ts";
import { EFFECTS } from "./types.ts";

export { initialize } from "./defaults.ts";
export { EFFECTS } from "./types.ts";

export function defaultScriptsDir(): string {
  return fileURLToPath(new URL("../../scripts/shared", import.meta.url));
}

export async function createAuthoringPolicy(scriptsDir: string) {
  const runtime = createRuntime({
    scripts: await loadScripts(scriptsDir),
    effects: EFFECTS,
    normalize,
  });
  return {
    runtime,
    dispatch(state: unknown, event: PolicyEvent): PolicyResult {
      return runtime.run("global", state, event);
    },
  };
}
