import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { dispatch } from "../src/policy.ts";

const originalXdg = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  if (originalXdg === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdg;
  }
});

describe("core policy host", () => {
  it("keeps a signed-out core healthy", async () => {
    process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "inpainter-xdg-"));
    const payload = await dispatch({
      type: "auth.status",
      authenticated: false,
      expires_at: null,
      error: null,
    });
    expect(payload.state).toBe("healthy");
    expect(payload.authenticated).toBe(false);
    expect(payload.crashed).toBe(false);
  });

  it("records a crash", async () => {
    process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "inpainter-xdg-"));
    const payload = await dispatch({ type: "core.crash", error: "boom" });
    expect(payload.state).toBe("crashed");
    expect(payload.crashed).toBe(true);
    expect(payload.error).toBe("boom");
  });
});
