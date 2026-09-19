import { access, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const DEMO_RENDER = [
  "react",
  "zustand",
  "electron",
  "animation-demo",
  "@openreel/",
  ".project/demos",
  "video-engine",
  "motion-renderer",
  "export-engine",
  "motion-engine",
  "handlers/",
  "@paper-design/shaders",
] as const;

const FORBIDDEN = [...DEMO_RENDER, "node:"];

const IMPORT_RE =
  /(?:import|export)(?:\s+type)?\s+(?:[^'"\n;]+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

function parseSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_RE)]
    .map((match) => match[1] ?? match[2])
    .filter((value): value is string => Boolean(value));
}

async function resolveRelative(fromFile: string, specifier: string): Promise<string | null> {
  if (!specifier.startsWith(".")) return null;
  const base = join(dirname(fromFile), specifier);
  const candidates = extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, `${base}.mjs`, join(base, "index.ts")];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

async function walkGraph(entry: string): Promise<{ files: string[]; specifiers: string[] }> {
  const files = new Set<string>();
  const specifiers: string[] = [];

  async function visit(file: string): Promise<void> {
    if (files.has(file)) return;
    files.add(file);
    const source = await readFile(file, "utf8");
    for (const specifier of parseSpecifiers(source)) {
      specifiers.push(specifier);
      const resolved = await resolveRelative(file, specifier);
      if (resolved) await visit(resolved);
    }
  }

  await visit(entry);
  return { files: [...files], specifiers };
}

describe("production document boundary", () => {
  it("document module graph stays free of demo, render, handlers, and Node imports", async () => {
    const { files, specifiers } = await walkGraph(join(root, "src/production/index.ts"));
    for (const specifier of specifiers) {
      for (const token of FORBIDDEN) {
        expect(specifier.includes(token), `${specifier} imports ${token}`).toBe(false);
      }
    }
    expect(files.some((file) => file.includes("/operations/"))).toBe(false);
    expect(files.some((file) => file.includes("/render/"))).toBe(false);
    expect(files.some((file) => file.endsWith("/cli.ts"))).toBe(false);
  });

  it("command entry does not resolve demo, OpenReel, or render packages", async () => {
    const { specifiers } = await walkGraph(join(root, "src/cli.ts"));
    for (const specifier of specifiers) {
      for (const token of DEMO_RENDER) {
        expect(specifier.includes(token), `${specifier} imports ${token}`).toBe(false);
      }
    }
  });
});
