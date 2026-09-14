export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type PolicyEvent = {
  type: string;
  [key: string]: unknown;
};

export type PolicyEffect = {
  type: string;
  [key: string]: unknown;
};

export type PolicyResult = {
  state: unknown;
  effects?: PolicyEffect[];
  payload?: Record<string, unknown>;
};

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export type Helpers = {
  delegate: (name: string, state: unknown, event: unknown) => PolicyResult;
};

export type Transition = (
  state: unknown,
  event: PolicyEvent,
  helpers: Helpers,
) => PolicyResult;

export type PolicyContract = {
  scripts: Record<string, Transition>;
  effects?: Iterable<string>;
  maxDelegateDepth?: number;
  normalize?: (result: PolicyResult) => PolicyResult;
};

export type PolicyRuntime = {
  run(script: string, state: unknown, event: unknown): PolicyResult;
};

const DEFAULT_MAX_DEPTH = 8;

export function createRuntime(contract: PolicyContract): PolicyRuntime {
  const allowedEffects = contract.effects ? new Set(contract.effects) : null;
  const maxDepth = contract.maxDelegateDepth ?? DEFAULT_MAX_DEPTH;

  function runScript(
    script: string,
    state: unknown,
    event: unknown,
    depth: number,
  ): PolicyResult {
    if (!Object.hasOwn(contract.scripts, script)) {
      throw new PolicyError(`unknown policy script: ${script}`);
    }
    if (depth > maxDepth) {
      throw new PolicyError(`policy delegate depth exceeded: ${script}`);
    }

    const helpers: Helpers = {
      delegate(name: string, childState: unknown, childEvent: unknown) {
        const nextState =
          childState !== null && typeof childState === "object" && !Array.isArray(childState)
            ? childState
            : {};
        const nextEvent =
          childEvent !== null && typeof childEvent === "object" && !Array.isArray(childEvent)
            ? childEvent
            : {};
        return runScript(String(name), nextState, nextEvent, depth + 1);
      },
    };

    const raw = contract.scripts[script](
      state,
      asEvent(event),
      helpers,
    );
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new PolicyError(`policy transition must return an object: ${script}`);
    }

    const result: PolicyResult = {
      state: raw.state,
      effects: asEffectList(raw.effects),
      payload:
        raw.payload !== undefined &&
        raw.payload !== null &&
        typeof raw.payload === "object" &&
        !Array.isArray(raw.payload)
          ? raw.payload
          : undefined,
    };

    if (allowedEffects) {
      for (const effect of result.effects ?? []) {
        if (!allowedEffects.has(effect.type)) {
          throw new PolicyError(`unsupported client effect: ${JSON.stringify(effect)}`);
        }
      }
    }

    return contract.normalize ? contract.normalize(result) : result;
  }

  return {
    run(script: string, state: unknown, event: unknown) {
      return runScript(script, state, event, 0);
    },
  };
}

function asEvent(event: unknown): PolicyEvent {
  if (event !== null && typeof event === "object" && !Array.isArray(event)) {
    const type = (event as { type?: unknown }).type;
    return { ...(event as Record<string, unknown>), type: String(type ?? "") };
  }
  return { type: "" };
}

function asEffectList(value: unknown): PolicyEffect[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        throw new PolicyError(`unsupported client effect: ${item}`);
      }
      return item as PolicyEffect;
    });
  }
  throw new PolicyError("Policy effects must be a list");
}
