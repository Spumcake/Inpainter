import type { PolicyEvent, PolicyResult } from "@inpainter/policy-runtime";

function luaTruthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

export function transition(state: unknown, event: PolicyEvent): PolicyResult {
  if (event.type === "auth.status") {
    return {
      state: luaTruthy(event.error) ? "unhealthy" : "healthy",
      payload: {
        authenticated: event.authenticated ?? null,
        expires_at: event.expires_at ?? null,
        error: event.error ?? null,
        crashed: false,
      },
    };
  }
  if (event.type === "core.crash") {
    return {
      state: "crashed",
      payload: {
        authenticated: false,
        expires_at: null,
        error: event.error ?? null,
        crashed: true,
      },
    };
  }
  return { state, payload: {} };
}
