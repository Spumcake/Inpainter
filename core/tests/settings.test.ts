import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { homeInit } from "../src/operations/home.ts";
import { getSettings, updateSettings } from "../src/operations/settings.ts";
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
  const home = mkdtempSync(join(tmpdir(), "inpainter-settings-"));
  process.env.INPAINTER_HOME = home;
  delete process.env.INPAINTER_SKILLS_DIR;
  cpSync(repoBootstrap, join(home, "bootstrap"), { recursive: true });
  return home;
}

describe("settings operations", () => {
  it("reads a valid settings document", () => {
    isolatedHome();
    homeInit();
    const settings = getSettings();
    expect(settings.title).toBe("Settings");
    expect(Array.isArray(settings.categories)).toBe(true);
    expect(Array.isArray(settings.panels)).toBe(true);
  });

  it("rejects an invalid settings document", () => {
    isolatedHome();
    homeInit();
    const path = settingsPath();
    writeFileSync(path, "not-json");
    expect(() => getSettings()).toThrow(CoreError);
    expect(() => getSettings()).toThrow(/not valid JSON/);
    expect(readFileSync(path, "utf8")).toBe("not-json");
  });

  it("merges and persists an update", () => {
    isolatedHome();
    homeInit();
    const updated = updateSettings({ title: "Edited Settings" });
    expect(updated.title).toBe("Edited Settings");
    expect(Array.isArray(updated.categories)).toBe(true);
    expect(getSettings().title).toBe("Edited Settings");
    expect(readFileSync(settingsPath(), "utf8")).toContain("Edited Settings");
  });

  it("rejects a patch that fails validation", () => {
    isolatedHome();
    homeInit();
    const original = readFileSync(settingsPath(), "utf8");
    expect(() => updateSettings({ title: "" })).toThrow(CoreError);
    expect(() => updateSettings({ title: "" })).toThrow(/missing required field title/);
    expect(() => updateSettings({ versionLabel: "" })).toThrow(/missing required field versionLabel/);
    expect(() => updateSettings({ selectedCategory: "" })).toThrow(
      /missing required field selectedCategory/,
    );
    expect(() => updateSettings({ panels: [null] })).toThrow(/panels\[0\] is not a valid settings record/);
    expect(() =>
      updateSettings({
        panels: [
          {
            categoryId: "installs",
            fields: [{ kind: "path", id: "installsLocation", title: "Installs", description: "Where" }],
          },
        ],
      }),
    ).toThrow(/missing required field value/);
    expect(readFileSync(settingsPath(), "utf8")).toBe(original);
  });

  it("exposes get and update through the core command", () => {
    const home = isolatedHome();
    homeInit();
    const read = spawnSync(tsx, [cli, "settings", "get"], {
      env: { ...process.env, INPAINTER_HOME: home },
      encoding: "utf8",
    });
    expect(read.status).toBe(0);
    expect(JSON.parse(read.stdout).title).toBe("Settings");
    const updated = spawnSync(tsx, [cli, "settings", "update"], {
      env: { ...process.env, INPAINTER_HOME: home },
      encoding: "utf8",
      input: JSON.stringify({ versionLabel: "Inpainter test" }),
    });
    expect(updated.status).toBe(0);
    expect(JSON.parse(updated.stdout).versionLabel).toBe("Inpainter test");
  });
});
