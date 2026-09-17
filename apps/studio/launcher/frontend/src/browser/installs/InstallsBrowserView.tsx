import { useEffect, useState } from "react";
import BrowserTree from "../shared/BrowserTree";
import SplitBrowserLayout from "../shared/SplitBrowserLayout";
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
    <SplitBrowserLayout
      tabs={content.tabs}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      left={
        pane && pane.tree.length > 0 ? (
          <BrowserTree
            nodes={pane.tree}
            expanded={expanded}
            selectedId={selectedId}
            onToggle={toggle}
            onSelect={setSelectedId}
          />
        ) : (
          <p className="py-1.5 text-sm text-neutral-500">{pane?.emptyMessage}</p>
        )
      }
      right={
        selectedSkill ? (
          <>
            <h2 className="text-sm font-semibold text-white">{selectedSkill.title ?? selectedSkill.label}</h2>
            {selectedSkill.description ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-400">
                {selectedSkill.description}
              </p>
            ) : null}
          </>
        ) : null
      }
    />
  );
}
