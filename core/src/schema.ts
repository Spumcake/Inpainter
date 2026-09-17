import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CoreError } from "./errors.ts";
import { schemaDir } from "./paths.ts";

type JsonSchema = {
  properties?: Record<string, { default?: unknown }>;
};

export function loadSchema(name: string): JsonSchema {
  const path = join(schemaDir(), `${name}.json`);
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new CoreError(`schema is not an object: ${name}`);
    }
    return data as JsonSchema;
  } catch (error) {
    if (error instanceof CoreError) {
      throw error;
    }
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new CoreError(`missing schema: ${name}`);
    }
    throw new CoreError(`unreadable schema: ${name}`);
  }
}

export function applyDefaults(
  name: string,
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const schema = loadSchema(name);
  const incoming = payload ?? {};
  const properties = schema.properties;
  if (!properties || typeof properties !== "object") {
    return { ...incoming };
  }
  const result: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(properties)) {
    if (!spec || typeof spec !== "object") {
      continue;
    }
    result[key] = key in incoming ? incoming[key] : spec.default;
  }
  return result;
}
