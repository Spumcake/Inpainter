import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import BrowserMenu from "./BrowserMenu";
import type { MenuAction } from "./types";

export type SplitBrowserTab = {
  id: string;
  label: string;
  menu?: MenuAction[];
  onMenuAction?: (actionId: string) => void;
};

type SplitBrowserLayoutProps = {
  tabs: SplitBrowserTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  tabExtra?: ReactNode;
  tabTrailing?: ReactNode;
  left?: ReactNode;
  hideLeft?: boolean;
  right: ReactNode;
};

export default function SplitBrowserLayout({
  tabs,
  activeTab,
  onSelectTab,
  tabExtra,
  tabTrailing,
  left,
  hideLeft = false,
  right,
}: SplitBrowserLayoutProps) {
  return (
    <div className="relative flex-1 flex flex-col bg-[#1c1c1c] overflow-hidden text-neutral-200">
      <div className="relative flex items-end gap-6 border-b border-[#333] pl-4 pr-4 pt-5 text-sm font-medium">
        <div className={`flex min-w-0 flex-1 items-end gap-6 ${tabTrailing ? "pr-40" : ""}`}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center gap-1 pb-2 border-b-2 ${
                tab.id === activeTab
                  ? "border-white text-white"
                  : "border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <button type="button" onClick={() => onSelectTab(tab.id)} className="max-w-[12rem] truncate">
                {tab.label}
              </button>
              {tab.menu && tab.menu.length > 0 ? (
                <BrowserMenu
                  items={tab.menu}
                  label={`${tab.label} menu`}
                  placement="right"
                  className="rounded p-0.5 text-neutral-500 hover:text-white"
                  onSelect={(actionId) => tab.onMenuAction?.(actionId)}
                >
                  <MoreHorizontal size={14} />
                </BrowserMenu>
              ) : null}
            </div>
          ))}
          {tabExtra}
        </div>
        {tabTrailing ? <div className="absolute bottom-2 right-4">{tabTrailing}</div> : null}
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!hideLeft ? (
          <div className="w-[280px] shrink-0 overflow-y-auto border-r border-[#333] py-3 pl-4 pr-2">{left}</div>
        ) : null}
        <div
          className={`min-h-0 min-w-0 flex-1 overflow-auto py-3 ${hideLeft ? "pl-4 pr-4" : "pl-2 pr-4"}`}
        >
          {right}
        </div>
      </div>
    </div>
  );
}

