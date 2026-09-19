import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cpSync } from "node:fs";

import { CoreError } from "../src/errors.ts";
import { createAgent } from "../src/operations/agents.ts";
import { homeInit } from "../src/operations/home.ts";
import { createWorkspace } from "../src/operations/workspaces.ts";

const originalHome = process.env.INPAINTER_HOME;
const originalSkills = process.env.INPAINTER_SKILLS_DIR;
const repoBootstrap = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../installer/setup/bootstrap",
);

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
  const home = mkdtempSync(join(tmpdir(), "inpainter-agents-"));
  process.env.INPAINTER_HOME = home;
  delete process.env.INPAINTER_SKILLS_DIR;
  cpSync(repoBootstrap, join(home, "bootstrap"), { recursive: true });
  return home;
}

describe("agent operations", () => {
  it("creates an agent under a workspace and defaults directory to the workspace path", () => {
    isolatedHome();
    homeInit();
    const location = mkdtempSync(join(tmpdir(), "inpainter-agent-workspace-"));
    const workspace = createWorkspace({ name: "Agent Home", location });
    const agent = createAgent({ workspaceId: workspace.id });
    expect(agent.directory).toBe(workspace.path);
    expect(agent.status).toBe("Idle");
    expect(agent.id).toBe(agent.name);
    expect(existsSync(join(workspace.path, ".inpainter", "agents", agent.id, "agent.json"))).toBe(
      true,
    );
    const stored = JSON.parse(
      readFileSync(join(workspace.path, ".inpainter", "agents", agent.id, "agent.json"), "utf8"),
    ) as { directory: string };
    expect(stored.directory).toBe(workspace.path);
  });

  it("writes a provided directory into agent metadata", () => {
    isolatedHome();
    homeInit();
    const location = mkdtempSync(join(tmpdir(), "inpainter-agent-dir-"));
    const workspace = createWorkspace({ name: "Custom Dir", location });
    const directory = join(workspace.path, "shots");
    const agent = createAgent({ workspaceId: workspace.id, directory });
    expect(agent.directory).toBe(directory);
    const stored = JSON.parse(
      readFileSync(join(workspace.path, ".inpainter", "agents", agent.id, "agent.json"), "utf8"),
    ) as { directory: string };
    expect(stored.directory).toBe(directory);
  });

  it("rejects an unknown workspace id", () => {
    isolatedHome();
    homeInit();
    expect(() => createAgent({ workspaceId: "missing" })).toThrow(CoreError);
    expect(() => createAgent({ workspaceId: "missing" })).toThrow(/not in the launcher/);
  });
});
