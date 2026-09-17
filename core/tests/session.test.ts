import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decrypt, encrypt } from "../src/session.ts";

describe("session encryption", () => {
  it("round-trips AES-256-GCM blobs in the Python-compatible layout", () => {
    const key = randomBytes(32);
    const plain = Buffer.from(
      JSON.stringify({
        access_token: "a",
        refresh_token: "r",
        expires_at: 1_800_000_000,
      }),
    );
    const blob = encrypt(key, plain);
    expect(blob.length).toBeGreaterThanOrEqual(12 + 16);
    expect(decrypt(key, blob).toString("utf8")).toBe(plain.toString("utf8"));
  });

  it("decrypts a nonce + ciphertext + tag fixture", () => {
    const key = Buffer.alloc(32, 1);
    const nonce = Buffer.alloc(12, 2);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const plain = Buffer.from('{"access_token":"tok"}');
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const blob = Buffer.concat([nonce, encrypted, cipher.getAuthTag()]);
    expect(decrypt(key, blob).toString("utf8")).toBe(plain.toString("utf8"));
  });
});
