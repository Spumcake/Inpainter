import {
  Book,
  BookOpen,
  Box,
  ChevronLeft,
  ChevronRight,
  Cloud,
  FolderClosed,
  HardDrive,
  Plus,
  Settings,
  type LucideIcon,
} from "lucide-react";
import logoMarks from "../../assets/logo-marks.svg";
import BrowserMenu from "../shared/BrowserMenu";
import type { DestinationNavItem, PrimaryNavigationProps } from "../shared/types";
import PrimaryNavigationSkeleton from "./PrimaryNavigationSkeleton";

const destinationIcons: Record<string, LucideIcon> = {
  folder: FolderClosed,
  "hard-drive": HardDrive,
  cloud: Cloud,
  "book-open": BookOpen,
  book: Book,
  box: Box,
};

function iconFor(item: DestinationNavItem): LucideIcon {
  return destinationIcons[item.icon] ?? Box;
}

export default function PrimaryNavigation({
  destinations,
  brandName,
  activeDestination,
  setActiveDestination,
  openSettings,
  onSectionAction,
  collapsed,
  onToggleCollapsed,
  ready,
}: PrimaryNavigationProps) {
  const renderDestinationButton = (item: DestinationNavItem, compact: boolean) => {
    const Icon = iconFor(item);
    const isActive = activeDestination === item.id;
    const sectionMenu = item.sectionMenu ?? [];

    if (compact) {
      return (
        <button
          key={item.id}
          onClick={() => setActiveDestination(item.id)}
          className={`w-full flex items-center justify-center p-2 rounded-md transition-colors ${
            isActive ? "bg-[#333333] text-white" : "text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
          }`}
          aria-label={item.label}
        >
          <Icon size={18} />
        </button>
      );
    }

    return (
      <div
        key={item.id}
        className={`w-full flex items-center rounded-md text-sm transition-colors ${
          isActive ? "bg-[#333333] text-white font-medium" : "text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
        }`}
      >
        <button
          onClick={() => setActiveDestination(item.id)}
          className="flex-1 flex items-center gap-3 px-3 py-2 text-left"
        >
          <Icon size={18} className={isActive ? "text-neutral-300" : "text-neutral-500"} />
          {item.label}
        </button>
        {sectionMenu.length > 0 ? (
          <BrowserMenu
            items={sectionMenu}
            label="Open menu"
            placement="right"
            className="mr-1 p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-[#3a3a3a] transition-colors"
            onSelect={(actionId) => onSectionAction(actionId, item.id)}
          >
            <Plus size={14} />
          </BrowserMenu>
        ) : null}
      </div>
    );
  };

  if (collapsed) {
    return (
      <div className="w-12 bg-[#1e1e1e] border-r border-[#333333] flex flex-col shrink-0 h-full">
        <div className="p-3 flex justify-center">
          <img src={logoMarks} alt={brandName} className="h-6 w-6" />
        </div>
        {ready ? (
          <nav className="flex-1 px-1.5 space-y-0.5 overflow-y-auto">
            {destinations.map((item) => renderDestinationButton(item, true))}
          </nav>
        ) : (
          <PrimaryNavigationSkeleton collapsed />
        )}
        <div className="p-1.5 border-t border-[#333333]">
          <button
            onClick={openSettings}
            className="w-full flex items-center justify-center p-2 rounded-md text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
        <div className="px-1.5 py-2 flex justify-center border-t border-[#333333]">
          <button
            onClick={onToggleCollapsed}
            className="p-1.5 text-neutral-500 hover:text-neutral-300"
            aria-label="Open sidebar"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[240px] bg-[#1e1e1e] border-r border-[#333333] flex flex-col shrink-0 h-full">
      <div className="p-4 flex items-center gap-2 mb-2">
        <img src={logoMarks} alt={brandName} className="h-6 w-6" />
        <span className="font-bold text-lg text-white">{brandName}</span>
      </div>

      {ready ? (
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {destinations.map((item) => renderDestinationButton(item, false))}
        </nav>
      ) : (
        <PrimaryNavigationSkeleton />
      )}

      <div className="p-2 border-t border-[#333333] mt-auto space-y-0.5">
        <button
          onClick={openSettings}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200 transition-colors"
        >
          <Settings size={18} className="text-neutral-500" />
          Settings
        </button>
      </div>

      <div className="px-4 py-3 flex items-center justify-between border-t border-[#333333]">
        <span className="text-neutral-500 font-bold tracking-tight">{brandName}</span>
        <button
          onClick={onToggleCollapsed}
          className="text-neutral-500 hover:text-neutral-300"
          aria-label="Close sidebar"
        >
          <ChevronLeft size={16} />
        </button>
      </div>
    </div>
  );
}
