import { join } from "node:path";

import { createCorePolicy } from "@inpainter/core-policy";
import type { PolicyEvent } from "@inpainter/policy-runtime";

import { coreRoot } from "./paths.ts";
import { applyDefaults } from "./schema.ts";
import { loadState, persistState } from "./state.ts";

type CorePolicy = Awaited<ReturnType<typeof createCorePolicy>>;

let policy: CorePolicy | undefined;

async function loadedPolicy(): Promise<CorePolicy> {
  if (!policy) {
    policy = await createCorePolicy(join(coreRoot(), "scripts"));
  }
  return policy;
}

export async function transition(state: unknown, event: PolicyEvent) {
  return (await loadedPolicy()).dispatch(state, event);
}

export async function dispatch(event: PolicyEvent): Promise<Record<string, unknown>> {
  const current = loadState();
  const result = await transition(current, event);
  const nextState =
    typeof result.state === "string" && result.state ? result.state : (current ?? "unknown");
  persistState(nextState);
  const payload =
    result.payload && typeof result.payload === "object" && !Array.isArray(result.payload)
      ? result.payload
      : {};
  const reported = applyDefaults("status", payload);
  reported.state = nextState;
  return reported;
}
