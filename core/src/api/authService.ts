import { CoreError } from "../errors.ts";

const DEFAULT_AUTH_URL = "http://127.0.0.1:8787";

export function authBaseUrl(): string {
  return (process.env.INPAINTER_AUTH_URL ?? DEFAULT_AUTH_URL).replace(/\/+$/u, "");
}

export async function exchangeCode(code: string, verifier: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${authBaseUrl()}/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, verifier }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new CoreError(`exchange request failed: ${error}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CoreError("exchange response was not json");
  }

  if (!response.ok) {
    const message =
      body !== null && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "token exchange failed";
    throw new CoreError(message);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new CoreError("exchange response was not json");
  }
  return body as Record<string, unknown>;
}
