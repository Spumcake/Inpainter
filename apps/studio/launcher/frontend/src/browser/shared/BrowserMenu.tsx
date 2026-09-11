import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Box, FolderPlus, Plus, X, type LucideIcon } from "lucide-react";
import type { MenuAction } from "./types";

const menuIcons: Record<string, LucideIcon> = {
  plus: Plus,
  "folder-plus": FolderPlus,
  x: X,
};

export type BrowserMenuPlacement = "left" | "right";

type BrowserMenuProps = {
  items: MenuAction[];
  onSelect: (id: string) => void;
  label: string;
  placement?: BrowserMenuPlacement;
  className?: string;
  children: ReactNode;
};

export default function BrowserMenu({
  items,
  onSelect,
  label,
  placement = "left",
  className,
  children,
}: BrowserMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onReposition = () => setOpen(false);

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const toggle = (event: ReactMouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords(
        placement === "right"
          ? { top: rect.top, left: rect.right + 4 }
          : { top: rect.top, left: rect.left - 4 },
      );
    }
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={className}
        onClick={toggle}
      >
        {children}
      </button>
      {open && coords ? (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[80] min-w-[180px] rounded-md border border-[#444] bg-[#2a2a2a] py-1 shadow-xl"
          style={{
            top: coords.top,
            left: coords.left,
            transform: placement === "left" ? "translateX(-100%)" : undefined,
          }}
        >
          {items.map((item) => {
            const Icon = menuIcons[item.icon] ?? Box;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-[#3a3a3a]"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onSelect(item.id);
                }}
              >
                <Icon size={14} className="text-neutral-400" />
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
