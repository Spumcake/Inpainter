import { describe, expect, it } from "vitest";
import { transition } from "../../scripts/global.ts";

/**
 * Fixtures from core/tests/test_core_policy.py.
 * Signed-out is healthy; only a present error makes the core unhealthy.
 */
describe("core policy", () => {
  it("keeps a signed-out core healthy", () => {
    const result = transition(null, {
      type: "auth.status",
      authenticated: false,
      expires_at: null,
      error: null,
    });
    expect(result.state).toBe("healthy");
    expect(result.payload).toMatchObject({
      authenticated: false,
      crashed: false,
    });
  });

  it("treats authenticated status as healthy", () => {
    const result = transition("unhealthy", {
      type: "auth.status",
      authenticated: true,
      expires_at: 1_800_000_000,
      error: null,
    });
    expect(result.state).toBe("healthy");
    expect(result.payload).toMatchObject({
      authenticated: true,
      expires_at: 1_800_000_000,
    });
  });

  it("records a crash", () => {
    const result = transition("healthy", { type: "core.crash", error: "boom" });
    expect(result.state).toBe("crashed");
    expect(result.payload).toMatchObject({ crashed: true, error: "boom" });
  });

  it("passes unknown events through", () => {
    const result = transition("healthy", { type: "noop" });
    expect(result.state).toBe("healthy");
    expect(result.payload).toEqual({});
  });
});
