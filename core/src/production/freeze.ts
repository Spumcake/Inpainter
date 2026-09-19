import type { ProductionDocument } from "./types.ts";

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry);
    return value;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneProject(project: ProductionDocument): ProductionDocument {
  const mediaItems = project.mediaLibrary.items.map((item) => ({ ...item }));
  const rest: ProductionDocument = {
    ...project,
    mediaLibrary: { items: [] },
  };
  let cloned: ProductionDocument;
  try {
    cloned = structuredClone(rest);
  } catch {
    cloned = cloneJson(rest);
  }
  return {
    ...cloned,
    mediaLibrary: { items: mediaItems },
  };
}

export function freezeProject(project: ProductionDocument): ProductionDocument {
  return deepFreeze(cloneProject(project));
}
