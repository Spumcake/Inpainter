import { writeFileSync, existsSync } from "node:fs";

import { acquireWriterLock } from "../src/operations/documentLock.ts";

const file = process.argv[2];
const ready = process.argv[3];
const go = process.argv[4];
if (!file || !ready || !go) {
  process.stderr.write("usage: lock-acquire-worker <file> <ready> <go>\n");
  process.exit(2);
}

writeFileSync(ready, "ready\n");
const deadline = Date.now() + 10_000;
while (!existsSync(go)) {
  if (Date.now() > deadline) {
    process.stderr.write("timeout waiting for go\n");
    process.exit(2);
  }
}

try {
  const lock = acquireWriterLock(file);
  process.stdout.write(`${JSON.stringify({ ok: true, holder: lock.holder, pid: lock.pid })}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(1);
}
