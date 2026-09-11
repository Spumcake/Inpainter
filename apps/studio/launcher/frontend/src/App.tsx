import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import AppTitleBar from "./browser/chrome/AppTitleBar";
import WorkspaceBrowser from "./browser/WorkspaceBrowser";
import SignIn from "./SignIn";
import Splash from "./Splash";
import Success from "./Success";

type View = "splash" | "signin" | "browser" | "opening";

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
  const launching = useRef(false);

  function openStudio() {
    if (launching.current) {
      return;
    }
    launching.current = true;
    setError(null);
    setView("opening");
    void invoke("launch_studio")
      .catch((err) => {
        launching.current = false;
        setError(err instanceof Error ? err.message : String(err));
      });
  }

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
        if (session.authenticated) {
          setView("browser");
        } else {
          setView("signin");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setView("signin");
        }
      });

    const unlisten = listen<AuthSessionPayload>("auth-session", (event) => {
      if (event.payload.authenticated) {
        setWaiting(false);
        setView("browser");
        return;
      }
      launching.current = false;
      setWaiting(false);
      setError(null);
      setView("signin");
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
        setView("browser");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.toLowerCase().includes("cancelled")) {
        setError(message);
      }
    } finally {
      setWaiting(false);
    }
  }

  if (view === "signin") {
    return (
      <div className="flex flex-col h-full">
        <AppTitleBar />
        <div className="flex-1 min-h-0">
          <SignIn
            waiting={waiting}
            error={error}
            onSignIn={handleSignIn}
            onSkip={() => setView("browser")}
          />
        </div>
      </div>
    );
  }

  if (view === "browser") {
    return <WorkspaceBrowser />;
  }

  if (view === "opening") {
    return (
      <div className="flex flex-col h-full">
        <AppTitleBar />
        <div className="flex-1 min-h-0">
          <Success error={error} onRetry={openStudio} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <AppTitleBar />
      <div className="flex-1 min-h-0">
        <Splash />
      </div>
    </div>
  );
}
