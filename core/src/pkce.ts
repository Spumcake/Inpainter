import { createHash, randomBytes } from "node:crypto";

export function randomB64(nbytes = 32): string {
  return b64url(randomBytes(nbytes));
}

export function pkceChallenge(verifier: string): string {
  const digest = createHash("sha256").update(verifier, "ascii").digest();
  return b64url(digest);
}

function b64url(data: Buffer): string {
  return data.toString("base64url");
}
