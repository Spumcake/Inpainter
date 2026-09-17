import { CoreError } from "../errors.ts";

const DEFAULT_SUPABASE_URL = "https://zhfgxembfkkrltimhzdw.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GZUhE3UoMBHrOOI6Z3x2NQ_QkBCPZFD";

export function supabaseUrl(): string {
  return (process.env.INPAINTER_SUPABASE_URL ?? DEFAULT_SUPABASE_URL).replace(/\/+$/u, "");
}

export function supabasePublishableKey(): string {
  return process.env.INPAINTER_SUPABASE_PUBLISHABLE_KEY ?? DEFAULT_SUPABASE_PUBLISHABLE_KEY;
}

export async function refreshSession(refreshToken: string): Promise<Record<string, unknown>> {
  const key = supabasePublishableKey();
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new CoreError(`refresh request failed: ${error}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CoreError("refresh response was not json");
  }

  if (!response.ok) {
    throw new CoreError("refresh failed");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new CoreError("refresh response was not json");
  }
  return body as Record<string, unknown>;
}
