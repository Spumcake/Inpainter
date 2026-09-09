import { useState } from "react";
import { ArrowUp, ChevronDown, Plus } from "lucide-react";
import logoUrl from "./assets/logo.svg";

const PROJECT_TITLE = "Workspace";

const SURFACE_ELEVATION =
  "bg-raised shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] dark:shadow-[0_1px_3px_rgba(0,0,0,0.2)] dark:ring-white/[0.08]";

function HomeComposer({ projectTitle }: { projectTitle: string }) {
  const [context, setContext] = useState("");

  return (
    <div className="flex flex-1 flex-col relative h-full">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-[30px]">
        <h1 className="mb-8 text-2xl font-normal tracking-tight text-fg-bright text-center">{projectTitle}</h1>
        <div className="relative w-full max-w-2xl">
          <form
            className={`flex w-full flex-col rounded-xl px-3 pt-3 pb-2 ${SURFACE_ELEVATION}`}
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                }
              }}
              placeholder="Ask Inpainter"
              rows={3}
              className="placeholder:text-fg-4 min-h-[4.5rem] w-full resize-none bg-transparent px-1 text-sm leading-relaxed text-fg focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Attach"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-line text-fg-3 hover:bg-hover hover:text-fg"
              >
                <Plus size={14} />
              </button>
              <button
                type="submit"
                aria-label="Submit"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-line text-fg-3 transition-colors hover:border-transparent hover:bg-accent hover:text-accent-fg"
              >
                <ArrowUp size={13} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function AppHeader({ projectTitle }: { projectTitle: string }) {
  return (
    <header className="relative z-50 flex h-9 shrink-0 items-center border-b border-divider bg-raised pl-2 pr-1">
      <div className="relative flex items-center gap-0.5">
        <button type="button" title="Inpainter" className="flex h-full items-center rounded-md p-1.5 hover:bg-hover">
          <img src={logoUrl} alt="Inpainter" className="h-6 w-6 rounded-md" />
        </button>
        <button type="button" title="Main menu" className="flex h-full items-center rounded-md px-1 py-1.5 hover:bg-hover">
          <ChevronDown size={14} strokeWidth={2.5} className="text-fg-2" />
        </button>
      </div>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-1 text-xs font-medium text-fg-2">
        {projectTitle}
      </span>
    </header>
  );
}

export default function App() {
  return (
    <div className="ca-root h-screen font-sans antialiased">
      <div className="flex h-screen flex-col overflow-hidden bg-canvas text-fg">
        <AppHeader projectTitle={PROJECT_TITLE} />
        <HomeComposer projectTitle={PROJECT_TITLE} />
      </div>
    </div>
  );
}
