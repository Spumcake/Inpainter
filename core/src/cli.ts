#!/usr/bin/env tsx
import { stdin } from "node:process";

import { CoreError } from "./errors.ts";
import { crash, authorizeUrl, exchange, logout, status } from "./operations/auth.ts";
import { invoke, loadSkill } from "./operations/capabilities.ts";
import { homeInit, homeStatus } from "./operations/home.ts";
import { writeJson } from "./output.ts";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) {
    return undefined;
  }
  return args[index + 1];
}

function requireOption(args: string[], name: string): string {
  const value = option(args, name);
  if (!value) {
    throw new CoreError(`${name} is required`);
  }
  return value;
}

async function run(argv: string[]): Promise<Record<string, unknown>> {
  const [group, command] = argv;
  if (group === "auth" && command === "authorize-url") {
    return authorizeUrl(requireOption(argv, "--redirect-uri"));
  }
  if (group === "auth" && command === "exchange") {
    return exchange(requireOption(argv, "--code"), requireOption(argv, "--state"));
  }
  if (group === "auth" && command === "status") {
    return status();
  }
  if (group === "auth" && command === "logout") {
    return logout();
  }
  if (group === "invoke") {
    const raw = await readStdin();
    const params = raw.trim() ? (JSON.parse(raw) as unknown) : {};
    if (params === null || typeof params !== "object" || Array.isArray(params)) {
      throw new CoreError("Invocation parameters must be an object");
    }
    return invoke(requireOption(argv, "--skill"), params as Record<string, unknown>);
  }
  if (group === "skill" && command === "show") {
    return loadSkill(requireOption(argv, "--id"));
  }
  if (group === "home" && command === "init") {
    return homeInit();
  }
  if (group === "home" && command === "status") {
    return homeStatus();
  }
  throw new CoreError("unknown command");
}

async function main(): Promise<void> {
  try {
    const payload = await run(process.argv.slice(2));
    writeJson(payload);
  } catch (error) {
    const message = error instanceof CoreError ? error.message : String(error);
    try {
      writeJson(await crash(message));
    } catch {
      writeJson({ error: message });
    }
    process.exitCode = 1;
  }
}

await main();
