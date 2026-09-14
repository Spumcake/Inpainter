import { readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { PolicyError, type Transition } from "./runtime.ts";

const SCRIPT_EXTENSIONS = new Set([".ts", ".js", ".mts", ".mjs"]);

export async function loadScripts(dir: string): Promise<Record<string, Transition>> {
  const root = await existingDir(dir);
  const scripts: Record<string, Transition> = {};
  for (const file of await listScriptFiles(root)) {
    const name = scriptName(root, file);
    const loaded = await importScript(file);
    if (typeof loaded.transition !== "function") {
      continue;
    }
    if (Object.hasOwn(scripts, name)) {
      throw new PolicyError(`duplicate policy script: ${name}`);
    }
    scripts[name] = loaded.transition as Transition;
  }
  return scripts;
}

async function existingDir(dir: string): Promise<string> {
  try {
    const info = await stat(dir);
    if (!info.isDirectory()) {
      throw new PolicyError(`policy scripts path is not a directory: ${dir}`);
    }
  } catch (error) {
    if (error instanceof PolicyError) {
      throw error;
    }
    throw new PolicyError(`policy scripts directory not found: ${dir}`);
  }
  return dir;
}

async function listScriptFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listScriptFiles(full)));
      continue;
    }
    if (!entry.isFile() || !isScriptFile(entry.name)) {
      continue;
    }
    files.push(full);
  }
  return files;
}

function isScriptFile(name: string): boolean {
  if (name.endsWith(".d.ts")) {
    return false;
  }
  return SCRIPT_EXTENSIONS.has(extname(name));
}

function scriptName(root: string, file: string): string {
  const relativePath = relative(root, file).replaceAll("\\", "/");
  return relativePath.replace(/\.(?:mts|mjs|ts|js)$/u, "");
}

async function importScript(file: string): Promise<Record<string, unknown>> {
  const url = pathToFileURL(file).href;
  if (file.endsWith(".ts") || file.endsWith(".mts")) {
    const specifier = "tsx/esm/api";
    const { tsImport } = (await import(specifier)) as {
      tsImport: (path: string, parent: string) => Promise<Record<string, unknown>>;
    };
    return tsImport(url, import.meta.url);
  }
  return (await import(url)) as Record<string, unknown>;
}
