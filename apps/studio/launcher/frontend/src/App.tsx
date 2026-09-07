import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import SignIn from "./SignIn";
import Splash from "./Splash";
import Success from "./Success";

type View = "splash" | "signin" | "success";

type AuthSessionPayload = {
  authenticated: boolean;
};

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export default function App() {
  const [view, setView] = useState<View>("splash");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      setView("signin");
      return;
    }

    let cancelled = false;
    void invoke<AuthSessionPayload>("get_auth_session")
      .then((session) => {
        if (cancelled) {
          return;
        }
        setView(session.authenticated ? "success" : "signin");
      })
      .catch(() => {
        if (!cancelled) {
          setView("signin");
        }
      });

    const unlisten = listen<AuthSessionPayload>("auth-session", (event) => {
      if (event.payload.authenticated) {
        setWaiting(false);
        setError(null);
        setView("success");
      }
    });

    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
    };
  }, []);

  async function handleSignIn() {
    if (!isTauri()) {
      setError("Sign in is only available in the Inpainter launcher.");
      return;
    }
    setWaiting(true);
    setError(null);
    try {
      const session = await invoke<AuthSessionPayload>("sign_in");
      if (session.authenticated) {
        setView("success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWaiting(false);
    }
  }

  if (view === "signin") {
    return <SignIn waiting={waiting} error={error} onSignIn={handleSignIn} />;
  }

  if (view === "success") {
    return <Success />;
  }

  return <Splash />;
}
