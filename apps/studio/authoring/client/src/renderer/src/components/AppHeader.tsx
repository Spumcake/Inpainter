import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import logoUrl from "../assets/logo.svg";
import type { HeaderAction } from "../../../session-contract";

const MENU_ITEMS: { id: string; label: string; emphasis?: boolean }[] = [
  { id: "conversation.new", label: "New Conversation" },
  { id: "app.quit", label: "Quit", emphasis: true },
];

export function AppHeader({
  title,
  actions,
  onAction,
}: {
  title: string;
  actions: HeaderAction[];
  onAction: (action: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLeft, setMenuLeft] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const available = new Map(actions.map((action) => [action.id, action.available]));

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    setMenuLeft(menuRef.current?.getBoundingClientRect().left ?? 0);
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <header className="relative z-50 flex h-9 shrink-0 items-center border-b border-divider bg-raised pl-2 pr-1">
      <div className="relative flex items-center gap-0.5" ref={menuRef}>
        <button type="button" title="Inpainter" className="flex h-full items-center rounded-md p-1.5 hover:bg-hover">
          <img src={logoUrl} alt="Inpainter" className="h-6 w-6 rounded-md" />
        </button>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Main menu"
          className={`flex h-full items-center rounded-md px-1 py-1.5 hover:bg-hover ${menuOpen ? "bg-hover" : ""}`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ChevronDown size={14} strokeWidth={2.5} className="text-fg-2" />
        </button>
        {menuOpen && menuLeft !== null ? (
          <div
            role="menu"
            className="fixed z-[100] min-w-[180px] overflow-hidden rounded-lg border border-line bg-modal py-1 shadow-lg"
            style={{ top: 44.5, left: menuLeft }}
          >
            <ol>
              {MENU_ITEMS.map((item) => {
                const enabled = available.get(item.id) ?? false;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!enabled}
                      className={`block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-hover ${
                        item.emphasis ? "font-semibold" : "font-normal"
                      } ${enabled ? "text-fg-2" : "cursor-not-allowed text-fg-4"}`}
                      onClick={() => {
                        if (!enabled) {
                          return;
                        }
                        setMenuOpen(false);
                        onAction(item.id);
                      }}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
      </div>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-1 text-xs font-medium text-fg-2">
        {title}
      </span>
    </header>
  );
}
