import { useState } from "react";
import { ArrowUp, Plus } from "lucide-react";

const SURFACE_ELEVATION =
  "bg-raised shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] dark:shadow-[0_1px_3px_rgba(0,0,0,0.2)] dark:ring-white/[0.08]";

export function IdleWaiting({
  title,
  placeholder,
  submitAvailable,
  notice,
  onSubmit,
}: {
  title: string;
  placeholder: string;
  submitAvailable: boolean;
  notice: string;
  onSubmit: (text: string) => void;
}) {
  const [context, setContext] = useState("");

  const submit = () => {
    const text = context.trim();
    if (!text || !submitAvailable) {
      return;
    }
    onSubmit(text);
    setContext("");
  };

  return (
    <div className="flex flex-1 flex-col relative h-full">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-[30px]">
        <h1 className="mb-8 text-2xl font-normal tracking-tight text-fg-bright text-center">{title}</h1>
        <div className="relative w-full max-w-2xl">
          <form
            className={`flex w-full flex-col rounded-xl px-3 pt-3 pb-2 ${SURFACE_ELEVATION}`}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={placeholder}
              rows={3}
              disabled={!submitAvailable}
              className="placeholder:text-fg-4 min-h-[4.5rem] w-full resize-none bg-transparent px-1 text-sm leading-relaxed text-fg focus:outline-none disabled:text-fg-4"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Attach"
                disabled
                className="flex h-7 w-7 flex-shrink-0 cursor-not-allowed items-center justify-center rounded-full border border-line text-fg-4"
              >
                <Plus size={14} />
              </button>
              <button
                type="submit"
                aria-label="Submit"
                disabled={!submitAvailable}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-line text-fg-3 transition-colors hover:border-transparent hover:bg-accent hover:text-accent-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp size={13} />
              </button>
            </div>
          </form>
        </div>
        {notice ? <p className="mt-8 text-center text-xs text-fg-4">{notice}</p> : null}
      </div>
    </div>
  );
}
