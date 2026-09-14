import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createRuntime, loadScripts } from "../src/index.ts";

async function fixtureDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "policy-scripts-"));
}

describe("loadScripts", () => {
  it("discovers nested transition modules by relative path", async () => {
    const dir = await fixtureDir();
    await mkdir(join(dir, "feed"), { recursive: true });
    await writeFile(
      join(dir, "global.ts"),
      `export function transition(state, _event, helpers) {
        return helpers.delegate("feed/chat-assistant", state, { type: "present" });
      }
      `,
    );
    await writeFile(
      join(dir, "feed", "chat-assistant.ts"),
      `export function transition(state) {
        return { state, effects: [{ type: "ui.status", text: "nested" }] };
      }
      `,
    );
    const runtime = createRuntime({ scripts: await loadScripts(dir) });
    const result = runtime.run("global", { phase: "idle" }, { type: "app.boot" });
    expect(result.effects).toEqual([{ type: "ui.status", text: "nested" }]);
  });

  it("skips reserved stubs that do not export transition", async () => {
    const dir = await fixtureDir();
    await writeFile(join(dir, "global.ts"), `export function transition(state) { return { state }; }\n`);
    await writeFile(join(dir, "left-sidebar.ts"), `// Reserved region. Drop a transition here later.\n`);
    const scripts = await loadScripts(dir);
    expect(Object.keys(scripts).sort()).toEqual(["global"]);
    const runtime = createRuntime({ scripts });
    expect(() => runtime.run("left-sidebar", {}, { type: "present" })).toThrow(
      /unknown policy script: left-sidebar/,
    );
  });

  it("makes a newly dropped file delegable on the next load", async () => {
    const dir = await fixtureDir();
    await writeFile(
      join(dir, "global.ts"),
      `export function transition(state, _event, helpers) {
        return helpers.delegate("extra", state, { type: "present" });
      }
      `,
    );
    const before = createRuntime({ scripts: await loadScripts(dir) });
    expect(() => before.run("global", {}, { type: "present" })).toThrow(/unknown policy script: extra/);

    await writeFile(
      join(dir, "extra.ts"),
      `export function transition(state) {
        return { state, effects: [{ type: "ui.status", text: "dropped" }] };
      }
      `,
    );
    const after = createRuntime({ scripts: await loadScripts(dir) });
    expect(after.run("global", { ok: true }, { type: "present" }).effects).toEqual([
      { type: "ui.status", text: "dropped" },
    ]);
  });

  it("rejects a missing scripts directory", async () => {
    await expect(loadScripts(join(tmpdir(), "missing-policy-scripts"))).rejects.toThrow(
      /policy scripts directory not found/,
    );
  });
});
