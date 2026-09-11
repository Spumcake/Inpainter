import { useState } from "react";
import { ChevronDown, MoreHorizontal, Settings } from "lucide-react";
import BrowserMenu from "../shared/BrowserMenu";
import FloatingSearch from "../shared/FloatingSearch";
import type { Project, TableDestinationContent } from "../shared/types";

type ProjectsBrowserViewProps = {
  content: TableDestinationContent;
  onOpenProject: (project: Project) => void;
  onRowAction?: (actionId: string, project: Project) => void;
};

export default function ProjectsBrowserView({
  content,
  onOpenProject,
  onRowAction,
}: ProjectsBrowserViewProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const visibleProjects = content.rows.filter((proj) => {
    const haystack = [proj.name, proj.path, ...proj.conversations.map((chat) => chat.name)]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const columns = "grid grid-cols-[48px_minmax(0,1fr)_9rem_7rem_48px] items-start gap-x-0";
  const nameLabel = content.columns.find((column) => column.key === "name")?.label ?? "Name";
  const modifiedLabel = content.columns.find((column) => column.key === "modified")?.label ?? "Modified";
  const sizeLabel = content.columns.find((column) => column.key === "size")?.label ?? "Size";
  const overflowMenu = content.overflowMenu ?? [];

  return (
    <div className="relative flex-1 flex flex-col bg-[#1c1c1c] overflow-hidden text-neutral-200">
      <div className="flex-1 overflow-y-auto px-8 pt-6 pb-20">
        <div className={`${columns} text-xs text-neutral-400 font-medium border-b border-[#333] pb-2 mb-2`}>
          <div />
          <div>{nameLabel}</div>
          <div>{modifiedLabel}</div>
          <div>{sizeLabel}</div>
          <div className="flex justify-center">
            <Settings size={14} />
          </div>
        </div>

        {visibleProjects.map((proj) => {
          const rowKey = proj.id || proj.path;
          const isOpen = expanded === rowKey;

          return (
            <div key={rowKey} className="mb-0.5">
              <div
                className={`${columns} py-3 hover:bg-[#262626] rounded-md px-0 group cursor-pointer`}
                onClick={() => onOpenProject(proj)}
              >
                <div className="self-center flex items-center justify-start pl-2 text-neutral-600 group-hover:text-neutral-400">
                  <button
                    type="button"
                    aria-label={isOpen ? "Collapse sessions" : "Expand sessions"}
                    onClick={(event) => {
                      event.stopPropagation();
                      setExpanded(isOpen ? null : rowKey);
                    }}
                    className="p-0"
                  >
                    <ChevronDown
                      size={16}
                      className={`transition-transform ${isOpen ? "" : "-rotate-90"}`}
                    />
                  </button>
                </div>
                <div className="min-w-0 pr-4">
                  <div className="text-sm font-semibold leading-5 text-white">{proj.name}</div>
                  <div className="text-xs text-neutral-500 mt-[5px] truncate">{proj.path}</div>
                </div>
                <div className="text-sm leading-5 text-neutral-400">{proj.modified}</div>
                <div className="text-sm leading-5 text-neutral-400">{proj.size}</div>
                <div
                  className="flex justify-center text-neutral-500 hover:text-white"
                  onClick={(event) => event.stopPropagation()}
                >
                  {overflowMenu.length > 0 ? (
                    <BrowserMenu
                      items={overflowMenu}
                      label="Open menu"
                      placement="left"
                      className="p-0 text-neutral-500 hover:text-white"
                      onSelect={(actionId) => onRowAction?.(actionId, proj)}
                    >
                      <MoreHorizontal size={18} />
                    </BrowserMenu>
                  ) : (
                    <MoreHorizontal size={18} />
                  )}
                </div>
              </div>

              {isOpen && proj.conversations.length > 0 ? (
                <div className="mb-2">
                  {proj.conversations.map((chat) => (
                    <div
                      key={chat.name}
                      className={`${columns} py-2.5 rounded-md hover:bg-[#262626] cursor-pointer`}
                    >
                      <div />
                      <div className="min-w-0 pr-4 text-sm text-neutral-200 truncate">{chat.name}</div>
                      <div className="text-sm text-neutral-500">{chat.modified}</div>
                      <div className="text-sm text-neutral-500">{chat.size}</div>
                      <div />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <FloatingSearch value={query} onChange={setQuery} placeholder={content.search.placeholder} />
    </div>
  );
}
