import { ProviderError, invalidRequest, timeoutError, unavailable } from "./errors";
import { lookup } from "./registry";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname === "/v1/invoke") {
        return await invoke(request);
      }

      return json({ error: "not found" }, 404);
    } catch (error) {
      if (error instanceof ProviderError) {
        return json(error.toBody(), error.httpStatus);
      }
      const fallback = unavailable(error instanceof Error ? error.message : "internal error");
      return json(fallback.toBody(), fallback.httpStatus);
    }
  },
};

async function invoke(request: Request): Promise<Response> {
  let body: { endpoint?: unknown; params?: unknown };
  try {
    body = await request.json();
  } catch {
    throw invalidRequest("invalid json");
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) {
    throw invalidRequest("endpoint is required");
  }

  const params = body.params;
  if (params !== undefined && (typeof params !== "object" || params === null || Array.isArray(params))) {
    throw invalidRequest("params must be an object");
  }

  const provider = lookup(endpoint);
  if (!provider) {
    throw invalidRequest(`unknown endpoint: ${endpoint}`);
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${provider.endpoint.replace(/\/$/, "")}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params: params ?? {} }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.toLowerCase().includes("timeout") || detail.toLowerCase().includes("timed out")) {
      throw timeoutError(`provider request timed out: ${detail}`);
    }
    throw unavailable(`provider unreachable: ${detail}`);
  }

  const text = await upstreamResponse.text();
  return new Response(text, {
    status: upstreamResponse.status,
    headers: { "content-type": upstreamResponse.headers.get("content-type") ?? "application/json; charset=utf-8" },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
