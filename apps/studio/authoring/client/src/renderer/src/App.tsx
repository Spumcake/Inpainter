import { useEffect, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { ChatAssistant } from "./components/ChatAssistant";
import { IdleWaiting } from "./components/IdleWaiting";
import type { Presentation } from "../../session-contract";

export default function App() {
  const [presentation, setPresentation] = useState<Presentation | null>(null);

  useEffect(() => {
    let active = true;
    void window.studio.getPresentation().then((next) => {
      if (active) {
        setPresentation(next);
      }
    });
    const unsubscribe = window.studio.subscribe(setPresentation);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && presentation?.status.working) {
        void window.studio.dispatch({ type: "request.cancel" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentation?.status.working]);

  const dispatch = (event: { type: string; [key: string]: unknown }) => {
    void window.studio.dispatch(event);
  };

  return (
    <div className="ca-root h-screen font-sans antialiased">
      <div className="flex h-screen flex-col overflow-hidden bg-canvas text-fg">
        <AppHeader
          title={presentation?.header.title ?? "Workspace"}
          actions={presentation?.header.actions ?? []}
          onAction={(action) => dispatch({ type: "header.action", action })}
        />
        {presentation?.feed.child === "chat-assistant" ? (
          <ChatAssistant
            messages={presentation.feed.messages}
            placeholder={presentation.feed.placeholder}
            submitAvailable={presentation.feed.submitAvailable}
            statusText={presentation.status.text}
            working={presentation.status.working || presentation.feed.working}
            onSubmit={(text) => dispatch({ type: "input.submitted", text })}
            onCancel={() => dispatch({ type: "request.cancel" })}
          />
        ) : (
          <IdleWaiting
            title={presentation?.feed.title ?? "Workspace"}
            placeholder={presentation?.feed.placeholder ?? "Ask Inpainter"}
            submitAvailable={presentation?.feed.submitAvailable ?? false}
            notice={presentation?.feed.notice ?? ""}
            onSubmit={(text) => dispatch({ type: "input.submitted", text })}
          />
        )}
      </div>
    </div>
  );
}
