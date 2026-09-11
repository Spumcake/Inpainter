import { useEffect, useState } from "react";
import { Folder, FolderOpen } from "lucide-react";
import type { SkillBrowserDestinationContent, SkillTreeNode } from "../shared/types";

type InstallsBrowserViewProps = {
  content: SkillBrowserDestinationContent;
};

function findSkill(nodes: SkillTreeNode[], id: string): SkillTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findSkill(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function SkillTree({
  nodes,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: {
  nodes: SkillTreeNode[];
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "folder") {
          const open = expanded.has(node.id);
          return (
            <div key={node.id}>
              <button
                type="button"
                onClick={() => onToggle(node.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-neutral-200 hover:bg-[#2a2a2a]"
                style={{ paddingLeft: 8 + depth * 12 }}
              >
                {open ? (
                  <FolderOpen size={14} className="shrink-0 text-neutral-500" />
                ) : (
                  <Folder size={14} className="shrink-0 text-neutral-500" />
                )}
                <span className="truncate">{node.label}</span>
              </button>
              {open && node.children && node.children.length > 0 ? (
                <SkillTree
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  selectedId={selectedId}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              ) : null}
            </div>
          );
        }

        const active = selectedId === node.id;
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelect(node.id)}
            className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm ${
              active ? "bg-[#2a2a2a] text-white" : "text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200"
            }`}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <span className="truncate">{node.label}</span>
          </button>
        );
      })}
    </>
  );
}

export default function InstallsBrowserView({ content }: InstallsBrowserViewProps) {
  const [activeTab, setActiveTab] = useState(content.selectedTab);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pane = content.panes[activeTab] ?? Object.values(content.panes)[0];

  useEffect(() => {
    setExpanded(new Set());
    setSelectedId(null);
  }, [activeTab]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selected = pane && selectedId ? findSkill(pane.tree, selectedId) : null;
  const selectedSkill = selected?.kind === "skill" ? selected : null;

  return (
    <div className="relative flex-1 flex flex-col bg-[#1c1c1c] overflow-hidden text-neutral-200">
      <div className="px-8 pt-6 border-b border-[#333] flex gap-6 text-sm font-medium">
        {content.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 border-b-2 ${
              tab.id === activeTab
                ? "border-white text-white"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-[48%] overflow-y-auto border-r border-[#333] p-3">
          {pane && pane.tree.length > 0 ? (
            <SkillTree
              nodes={pane.tree}
              depth={0}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={toggle}
              onSelect={setSelectedId}
            />
          ) : (
            <p className="px-2 py-1.5 text-sm text-neutral-500">{pane?.emptyMessage}</p>
          )}
        </div>
        <div className="flex w-[52%] flex-col overflow-y-auto p-6">
          {selectedSkill ? (
            <>
              <h2 className="text-sm font-semibold text-white">
                {selectedSkill.title ?? selectedSkill.label}
              </h2>
              {selectedSkill.description ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-400">
                  {selectedSkill.description}
                </p>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">{pane?.emptyDescription}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-500">{pane?.emptyDescription}</p>
          )}
        </div>
      </div>
    </div>
  );
}
