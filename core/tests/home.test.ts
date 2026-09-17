import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { homeInit } from "../src/operations/home.ts";
import { loadSkill } from "../src/operations/capabilities.ts";
import { settingsPath } from "../src/paths.ts";

const originalHome = process.env.INPAINTER_HOME;
const originalSkills = process.env.INPAINTER_SKILLS_DIR;
const repoBootstrap = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../installer/setup/bootstrap",
);
const tsx = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/.bin/tsx");
const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../src/cli.ts");

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.INPAINTER_HOME;
  } else {
    process.env.INPAINTER_HOME = originalHome;
  }
  if (originalSkills === undefined) {
    delete process.env.INPAINTER_SKILLS_DIR;
  } else {
    process.env.INPAINTER_SKILLS_DIR = originalSkills;
  }
});

function isolatedHome(): string {
  const home = mkdtempSync(join(tmpdir(), "inpainter-home-"));
  process.env.INPAINTER_HOME = home;
  delete process.env.INPAINTER_SKILLS_DIR;
  cpSync(repoBootstrap, join(home, "bootstrap"), { recursive: true });
  return home;
}

describe("application home", () => {
  it("initializes a selected home without touching existing files on the second run", () => {
    isolatedHome();
    const first = homeInit();
    expect(first.initialized).toBe(true);
    expect(first.seeded).toEqual({ settings: "created", launcher: "created" });
    const path = settingsPath();
    const original = readFileSync(path, "utf8");
    writeFileSync(path, original.replace("Inpainter 0.1.0", "edited-settings"));
    const second = homeInit();
    expect(second.seeded).toEqual({ settings: "existing", launcher: "existing" });
    expect(readFileSync(path, "utf8")).toContain("edited-settings");
    expect(loadSkill("openai/discuss").id).toBe("openai/discuss");
  });

  it("reports malformed settings without replacing them", () => {
    isolatedHome();
    homeInit();
    const path = settingsPath();
    writeFileSync(path, "not-json");
    expect(() => homeInit()).toThrow(CoreError);
    expect(() => homeInit()).toThrow(/not valid JSON/);
    expect(readFileSync(path, "utf8")).toBe("not-json");
  });

  it("loads skills from an unrelated working directory", () => {
    const home = isolatedHome();
    homeInit();
    const cwd = mkdtempSync(join(tmpdir(), "inpainter-cwd-"));
    const result = spawnSync(tsx, [cli, "skill", "show", "--id", "openai/discuss"], {
      cwd,
      env: { ...process.env, INPAINTER_HOME: home },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).id).toBe("openai/discuss");
  });
});
