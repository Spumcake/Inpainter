import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CoreError } from "../src/errors.ts";
import { invoke, loadSkill } from "../src/operations/capabilities.ts";

const originalSkills = process.env.INPAINTER_SKILLS_DIR;
const originalApi = process.env.INPAINTER_API_URL;

afterEach(() => {
  if (originalSkills === undefined) {
    delete process.env.INPAINTER_SKILLS_DIR;
  } else {
    process.env.INPAINTER_SKILLS_DIR = originalSkills;
  }
  if (originalApi === undefined) {
    delete process.env.INPAINTER_API_URL;
  } else {
    process.env.INPAINTER_API_URL = originalApi;
  }
  vi.unstubAllGlobals();
});

function writeSkill(dir: string, id = "openai/discuss") {
  const path = join(dir, `${id}.json`);
  mkdirSync(join(dir, "openai"), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      id,
      endpoint: "discuss",
      layout: "chat-assistant",
      model: "gpt-test",
    }),
  );
  return path;
}

describe("skill load and invoke", () => {
  it("posts the generic platform contract and forwards history", async () => {
    const root = mkdtempSync(join(tmpdir(), "inpainter-skills-"));
    writeSkill(root);
    process.env.INPAINTER_SKILLS_DIR = root;
    process.env.INPAINTER_API_URL = "http://platform.test";
    const history = [{ role: "user", content: "hello" }];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://platform.test/v1/invoke");
      const body = JSON.parse(String(init?.body)) as {
        endpoint: string;
        params: Record<string, unknown>;
      };
      expect(body.endpoint).toBe("discuss");
      expect(body.params.messages).toEqual(history);
      expect(body.params.model).toBe("gpt-test");
      expect(init?.headers).not.toHaveProperty("Authorization");
      return new Response(JSON.stringify({ reply: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      invoke("openai/discuss", { message: "hello", messages: history }),
    ).resolves.toEqual({ reply: "hello" });
  });

  it("rejects path traversal and platform errors", async () => {
    const root = mkdtempSync(join(tmpdir(), "inpainter-skills-"));
    writeSkill(root);
    process.env.INPAINTER_SKILLS_DIR = root;
    expect(() => loadSkill("../../etc/passwd")).toThrow(CoreError);
    expect(() => loadSkill("../../etc/passwd")).toThrow("invalid skill path");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    await expect(invoke("openai/discuss", {})).rejects.toThrow(/offline/);
  });
});
