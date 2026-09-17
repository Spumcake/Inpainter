import { authBaseUrl, exchangeCode } from "../api/authService.ts";
import { refreshSession } from "../api/supabase.ts";
import { CoreError } from "../errors.ts";
import { clearPending, takePending, writePending } from "../pending.ts";
import { pkceChallenge, randomB64 } from "../pkce.ts";
import { dispatch } from "../policy.ts";
import {
  clearSession,
  loadSession,
  nowSecs,
  sessionFromTokenBody,
  sessionIsFresh,
  writeSession,
} from "../session.ts";

export async function authorizeUrl(redirectUri: string): Promise<Record<string, unknown>> {
  const state = randomB64();
  const verifier = randomB64();
  const challenge = pkceChallenge(verifier);
  writePending(state, verifier);
  const query = new URLSearchParams({
    state,
    challenge,
    redirect_uri: redirectUri,
    _: String(nowSecs()),
  });
  return {
    authorize_url: `${authBaseUrl()}/sign-in?${query.toString()}`,
    state,
  };
}

export async function exchange(code: string, state: string): Promise<Record<string, unknown>> {
  const pending = takePending(state);
  const body = await exchangeCode(code, pending.verifier);
  writeSession(sessionFromTokenBody(body));
  return status();
}

export async function status(): Promise<Record<string, unknown>> {
  return dispatch({ type: "auth.status", ...(await authFacts()) });
}

export async function logout(): Promise<Record<string, unknown>> {
  clearPending();
  clearSession();
  return status();
}

export async function crash(error: string): Promise<Record<string, unknown>> {
  return dispatch({ type: "core.crash", error });
}

export async function authFacts(): Promise<Record<string, unknown>> {
  const session = loadSession();
  if (session === null) {
    return { authenticated: false, expires_at: null, error: null };
  }
  if (sessionIsFresh(session)) {
    return {
      authenticated: true,
      expires_at: session.expires_at,
      error: null,
    };
  }
  try {
    const refreshed = sessionFromTokenBody(await refreshSession(session.refresh_token));
    writeSession(refreshed);
    return {
      authenticated: true,
      expires_at: refreshed.expires_at,
      error: null,
    };
  } catch (error) {
    clearSession();
    return {
      authenticated: false,
      expires_at: null,
      error: error instanceof CoreError ? error.message : String(error),
    };
  }
}
