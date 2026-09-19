import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CoreError } from "../errors.ts";
import { listWorkspaces } from "./workspaces.ts";

const AGENT_STATUS_IDLE = "Idle";

export type AgentRecord = {
  id: string;
  name: string;
  directory: string;
  status: string;
  modified: string;
};

export function createAgent(input: { workspaceId: string; directory?: string }): AgentRecord {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    throw new CoreError("Workspace id is required.");
  }
  const workspace = listWorkspaces().workspaces.find((item) => item.id === workspaceId);
  if (!workspace) {
    throw new CoreError("That workspace is not in the launcher.");
  }
  const agents = join(workspace.path, ".inpainter", "agents");
  mkdirSync(agents, { recursive: true });
  const slug = localTimestamp();
  let dest = join(agents, slug);
  let suffix = 1;
  while (existsSync(dest)) {
    dest = join(agents, `${slug}-${suffix}`);
    suffix += 1;
  }
  mkdirSync(dest, { recursive: true });
  const name = dest.split(/[\\/]/u).at(-1) ?? slug;
  const directory = input.directory?.trim() || workspace.path;
  writeFileSync(join(dest, "agent.json"), `${JSON.stringify({ directory }, null, 2)}\n`);
  return {
    id: name,
    name,
    directory,
    status: AGENT_STATUS_IDLE,
    modified: new Date().toISOString(),
  };
}

function localTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
