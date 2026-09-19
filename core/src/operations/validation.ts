import { readFileSync } from "node:fs";

import { CoreError } from "../errors.ts";

export function readJsonObject(path: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new CoreError(`${path} is not valid JSON`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CoreError(`${path} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export function requiredString(value: Record<string, unknown>, key: string, path: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field.trim()) {
    throw new CoreError(`${path} is missing required field ${key}`);
  }
  return field.trim();
}

export function validateSettings(value: Record<string, unknown>, path: string): void {
  requiredString(value, "title", path);
  requiredString(value, "versionLabel", path);
  requiredString(value, "selectedCategory", path);
  if (!Array.isArray(value.categories) || !Array.isArray(value.panels)) {
    throw new CoreError(`${path} is not a valid settings document`);
  }
  value.categories.forEach((category, index) => {
    validateSettingsCategory(category, `${path}.categories[${index}]`);
  });
  value.panels.forEach((panel, index) => {
    validateSettingsPanel(panel, `${path}.panels[${index}]`);
  });
}

function validateSettingsCategory(value: unknown, path: string): void {
  const record = asObject(value, path);
  requiredString(record, "id", path);
  requiredString(record, "label", path);
}

function validateSettingsPanel(value: unknown, path: string): void {
  const record = asObject(value, path);
  requiredString(record, "categoryId", path);
  if (!Array.isArray(record.fields)) {
    throw new CoreError(`${path} is missing required field fields`);
  }
  record.fields.forEach((field, index) => {
    validateSettingsField(field, `${path}.fields[${index}]`);
  });
}

function validateSettingsField(value: unknown, path: string): void {
  const record = asObject(value, path);
  const kind = requiredString(record, "kind", path);
  if (kind === "path") {
    requiredString(record, "id", path);
    requiredString(record, "title", path);
    requiredString(record, "description", path);
    requiredString(record, "value", path);
    return;
  }
  if (kind === "number") {
    requiredString(record, "id", path);
    requiredString(record, "title", path);
    requiredString(record, "description", path);
    requiredNumber(record, "value", path);
    requiredNumber(record, "min", path);
    requiredNumber(record, "max", path);
    return;
  }
  if (kind === "bool") {
    requiredString(record, "id", path);
    requiredString(record, "title", path);
    requiredString(record, "description", path);
    requiredBoolean(record, "value", path);
    requiredString(record, "label", path);
    return;
  }
  if (kind === "placeholder") {
    requiredString(record, "message", path);
    return;
  }
  throw new CoreError(`${path} has unsupported field kind ${kind}`);
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreError(`${path} is not a valid settings record`);
  }
  return value as Record<string, unknown>;
}

function requiredNumber(value: Record<string, unknown>, key: string, path: string): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isFinite(field)) {
    throw new CoreError(`${path} is missing required field ${key}`);
  }
  return field;
}

function requiredBoolean(value: Record<string, unknown>, key: string, path: string): boolean {
  const field = value[key];
  if (typeof field !== "boolean") {
    throw new CoreError(`${path} is missing required field ${key}`);
  }
  return field;
}

export function validateLauncher(value: Record<string, unknown>, path: string): void {
  if (value.workspaces !== undefined && !Array.isArray(value.workspaces)) {
    throw new CoreError(`${path} is not a valid launcher registry`);
  }
}
