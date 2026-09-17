import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { CoreError } from "../errors.ts";
import { skillRoots } from "../paths.ts";

export type SkillRecord = {
  id: string;
  endpoint: string;
  layout: string;
  model: string;
  instructions: string;
  [key: string]: unknown;
};

export function loadSkill(skillId: string): SkillRecord {
  if (isAbsolute(skillId) || skillId.split(sep).includes("..")) {
    throw new CoreError("invalid skill path");
  }
  let path: string | undefined;
  for (const root of skillRoots()) {
    const candidate = resolve(root, `${skillId}.json`);
    const rel = relative(resolve(root), candidate);
    if (rel.startsWith("..") || rel.split(sep).includes("..")) {
      throw new CoreError("invalid skill path");
    }
    if (existsSync(candidate)) {
      path = candidate;
      break;
    }
  }
  if (!path) {
    throw new CoreError(`Cannot load skill ${skillId}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new CoreError(`Cannot load skill ${skillId}`);
  }
  if (
    data === null ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !["id", "endpoint", "layout", "model"].every(
      (key) => typeof (data as Record<string, unknown>)[key] === "string" && (data as Record<string, string>)[key],
    )
  ) {
    throw new CoreError(`Incomplete skill: ${skillId}`);
  }
  const record = data as SkillRecord;
  try {
    record.instructions = readFileSync(path.replace(/\.json$/u, ".md"), "utf8");
  } catch {
    record.instructions = "";
  }
  return record;
}

export async function invoke(skillId: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const skill = loadSkill(skillId);
  const payload = { ...params, model: skill.model, instructions: skill.instructions };
  const url = (process.env.INPAINTER_API_URL ?? "http://127.0.0.1:8788").replace(/\/+$/u, "");
  let response: Response;
  try {
    response = await fetch(`${url}/v1/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: skill.endpoint, params: payload }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new CoreError(`Platform request failed (${url}): ${error}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CoreError("Platform returned an invalid response");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new CoreError("Platform returned an invalid response");
  }
  const record = body as Record<string, unknown>;
  if (!response.ok || record.error) {
    throw new CoreError(String(record.error || `Platform returned HTTP ${response.status}`));
  }
  return record;
}
