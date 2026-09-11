import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import type { FeedMessage } from "../../../session-contract";

const SURFACE_ELEVATION =
  "bg-raised shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] dark:shadow-[0_1px_3px_rgba(0,0,0,0.2)] dark:ring-white/[0.08]";
const MESSAGE_FEED_MAX_WIDTH = "930px";
const COMPOSER_MAX_WIDTH = "600px";
const RESPONSE_MAX_WIDTH = "768px";

export function ChatAssistant({
  messages,
  placeholder,
  submitAvailable,
  statusText,
  working,
  onSubmit,
  onCancel,
}: {
  messages: FeedMessage[];
  placeholder: string;
  submitAvailable: boolean;
  statusText: string;
  working: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [context, setContext] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, working]);

  useEffect(() => {
    if (!working) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 200);
    return () => window.clearInterval(timer);
  }, [working]);

  const submit = () => {
    const text = context.trim();
    if (!text || !submitAvailable) {
      return;
    }
    onSubmit(text);
    setContext("");
  };

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden relative">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-[20px] pb-6">
        <div className="mx-auto space-y-2" style={{ maxWidth: MESSAGE_FEED_MAX_WIDTH }}>
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}-${message.text.slice(0, 24)}`}
              className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`flex flex-col gap-2 rounded-lg text-sm ${
                  message.role === "user"
                    ? "max-w-2xl bg-prompt p-[10px] text-fg"
                    : message.role === "system"
                      ? "px-4 py-3 text-fg-4"
                      : "px-4 py-3 text-fg"
                }`}
                style={message.role === "assistant" ? { maxWidth: RESPONSE_MAX_WIDTH } : undefined}
              >
                <div className="leading-relaxed whitespace-pre-wrap">{message.text}</div>
              </div>
            </div>
          ))}
          {working ? (
            <p className="px-4 pt-2 text-xs text-fg-4">
              {statusText || "Working"}
              {elapsed ? ` (${elapsed}s)` : ""} · Esc to interrupt
            </p>
          ) : null}
        </div>
      </div>
      <div className="sticky bottom-0 z-40 bg-canvas px-6 pb-3 pt-2">
        <form
          className={`mx-auto flex w-full items-center gap-1 rounded-full px-2 py-1.5 ${SURFACE_ELEVATION}`}
          style={{ maxWidth: COMPOSER_MAX_WIDTH }}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            type="text"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && working) {
                event.preventDefault();
                onCancel();
              }
            }}
            placeholder={placeholder}
            disabled={working}
            className="placeholder:text-fg-4 min-w-0 flex-1 bg-transparent px-3 text-sm text-fg focus:outline-none disabled:text-fg-4"
          />
          <button
            type="submit"
            aria-label="Submit"
            disabled={!submitAvailable}
            className="hover:bg-accent-hover ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
