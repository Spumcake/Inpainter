type Env = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
};

type PendingHandoff = {
  accessToken: string;
  refreshToken: string;
  challenge: string;
  state: string;
  expiresAt: number;
};

const CODE_TTL_MS = 2 * 60 * 1000;
const pending = new Map<string, PendingHandoff>();

const LOOPBACK_REDIRECT =
  /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/sign-in") {
      return signInPage(url, env);
    }

    if (request.method === "POST" && url.pathname === "/handoff") {
      return handoff(request);
    }

    if (request.method === "POST" && url.pathname === "/exchange") {
      return exchange(request);
    }

    return json({ error: "not found" }, 404);
  },
};

function signInPage(url: URL, env: Env): Response {
  const state = url.searchParams.get("state") ?? "";
  const challenge = url.searchParams.get("challenge") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in to Inpainter</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      background: #151515; color: #fff;
    }
    form {
      width: min(360px, calc(100vw - 48px));
      display: flex; flex-direction: column; gap: 12px;
    }
    h1 { font-size: 16px; margin: 0 0 4px; }
    p { margin: 0 0 8px; color: #a3a3a3; font-size: 14px; line-height: 1.5; }
    label { font-size: 13px; color: #d4d4d4; }
    input {
      width: 100%; padding: 10px 12px; border-radius: 6px; border: 1px solid #404040;
      background: #0a0a0a; color: #fff; font-size: 14px;
    }
    button {
      margin-top: 6px; padding: 10px 16px; border: 0; border-radius: 6px;
      background: #fff; color: #000; font-weight: 600; font-size: 14px; cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: default; }
    .error { color: #f87171; font-size: 13px; min-height: 1.2em; }
  </style>
</head>
<body>
  <form id="form">
    <h1>Sign in to Inpainter</h1>
    <p>Use the account already provisioned for this project. After signing in you will return to the launcher.</p>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="username" required />
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />
    <button type="submit" id="submit">Sign in</button>
    <p class="error" id="error"></p>
  </form>
  <script>
    const SUPABASE_URL = ${JSON.stringify(env.SUPABASE_URL.replace(/\/$/, ""))};
    const PUBLISHABLE_KEY = ${JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY)};
    const state = ${JSON.stringify(state)};
    const challenge = ${JSON.stringify(challenge)};
    const redirectUri = ${JSON.stringify(redirectUri)};

    const form = document.getElementById("form");
    const submit = document.getElementById("submit");
    const errorEl = document.getElementById("error");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorEl.textContent = "";
      if (!state || !challenge || !redirectUri) {
        errorEl.textContent = "This page must be opened from the Inpainter launcher.";
        return;
      }
      submit.disabled = true;
      try {
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const tokenRes = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
          method: "POST",
          headers: {
            apikey: PUBLISHABLE_KEY,
            Authorization: "Bearer " + PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });
        const tokenBody = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok) {
          throw new Error(tokenBody.error_description || tokenBody.msg || tokenBody.error || "Sign in failed");
        }
        if (!tokenBody.access_token || !tokenBody.refresh_token) {
          throw new Error("Supabase did not return a session");
        }
        const handoffRes = await fetch("/handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: tokenBody.access_token,
            refresh_token: tokenBody.refresh_token,
            challenge,
            state,
            redirect_uri: redirectUri,
          }),
        });
        const handoffBody = await handoffRes.json().catch(() => ({}));
        if (!handoffRes.ok) {
          throw new Error(handoffBody.error || "Handoff failed");
        }
        const next = new URL(redirectUri);
        next.searchParams.set("code", handoffBody.code);
        next.searchParams.set("state", state);
        window.location.replace(next.toString());
      } catch (err) {
        errorEl.textContent = err instanceof Error ? err.message : "Sign in failed";
        submit.disabled = false;
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function handoff(request: Request): Promise<Response> {
  pruneExpired();

  let body: {
    access_token?: string;
    refresh_token?: string;
    challenge?: string;
    state?: string;
    redirect_uri?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const accessToken = body.access_token?.trim() ?? "";
  const refreshToken = body.refresh_token?.trim() ?? "";
  const challenge = body.challenge?.trim() ?? "";
  const state = body.state?.trim() ?? "";
  const redirectUri = body.redirect_uri?.trim() ?? "";

  if (!accessToken || !refreshToken || !challenge || !state) {
    return json({ error: "missing fields" }, 400);
  }
  if (!LOOPBACK_REDIRECT.test(redirectUri)) {
    return json({ error: "invalid redirect_uri" }, 400);
  }

  const code = randomCode();
  pending.set(code, {
    accessToken,
    refreshToken,
    challenge,
    state,
    expiresAt: Date.now() + CODE_TTL_MS,
  });

  return json({ code, state });
}

async function exchange(request: Request): Promise<Response> {
  pruneExpired();

  let body: { code?: string; verifier?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const code = body.code?.trim() ?? "";
  const verifier = body.verifier?.trim() ?? "";
  if (!code || !verifier) {
    return json({ error: "missing fields" }, 400);
  }

  const record = pending.get(code);
  pending.delete(code);
  if (!record || record.expiresAt <= Date.now()) {
    return json({ error: "invalid or expired code" }, 400);
  }

  const computed = await pkceChallenge(verifier);
  if (computed !== record.challenge) {
    return json({ error: "invalid verifier" }, 400);
  }

  return json({
    access_token: record.accessToken,
    refresh_token: record.refreshToken,
  });
}

function pruneExpired() {
  const now = Date.now();
  for (const [code, record] of pending) {
    if (record.expiresAt <= now) {
      pending.delete(code);
    }
  }
}

function randomCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
