import { File, FileJson, Folder, FolderOpen, Monitor, Settings } from "lucide-react";
import BrowserMenu from "./BrowserMenu";
import type { MenuAction, SkillTreeNode } from "./types";

const TREE_INSET = 8;
const TREE_INDENT = 12;

function rowPad(depth: number): number {
  return TREE_INSET + depth * TREE_INDENT;
}

function FileGlyph({ label }: { label: string }) {
  const Icon = label.toLowerCase().endsWith(".json") ? FileJson : File;
  return (
    <span className="shrink-0 text-neutral-500">
      <Icon size={14} />
    </span>
  );
}

type BrowserTreeProps = {
  nodes: SkillTreeNode[];
  depth?: number;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  menuForNode?: (node: SkillTreeNode) => MenuAction[] | null;
  onMenuAction?: (node: SkillTreeNode, actionId: string) => void;
};

export default function BrowserTree({
  nodes,
  depth = 0,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  menuForNode,
  onMenuAction,
}: BrowserTreeProps) {
  return (
    <>
      {nodes.map((node) => {
        const isWorkspace = node.kind === "workspace";
        const isFolder = node.kind === "folder" || isWorkspace;
        if (!isFolder) {
          const active = selectedId === node.id;
          const showMonitor = node.kind === "view" || node.kind === "action";
          const menuItems = menuForNode?.(node) ?? [];
          if (menuItems.length === 0) {
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelect(node.id)}
                className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm gap-2 ${
                  active ? "bg-[#2a2a2a] text-white" : "text-neutral-200 hover:bg-[#2a2a2a]"
                }`}
                style={{ paddingLeft: rowPad(depth) }}
              >
                {showMonitor ? (
                  <span className="shrink-0 text-neutral-500">
                    <Monitor size={14} />
                  </span>
                ) : (
                  <FileGlyph label={node.label} />
                )}
                <span className="truncate">{node.label}</span>
              </button>
            );
          }
          return (
            <div
              key={node.id}
              className={`flex w-full items-center rounded-md ${
                active ? "bg-[#2a2a2a] text-white" : "text-neutral-200 hover:bg-[#2a2a2a]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                style={{ paddingLeft: rowPad(depth) }}
              >
                {showMonitor ? (
                  <span className="shrink-0 text-neutral-500">
                    <Monitor size={14} />
                  </span>
                ) : (
                  <FileGlyph label={node.label} />
                )}
                <span className="truncate">{node.label}</span>
              </button>
              <BrowserMenu
                items={menuItems}
                label="Open menu"
                placement="left"
                className="mr-0.5 shrink-0 rounded-md p-1 text-neutral-400 hover:bg-[#3a3a3a] hover:text-white"
                onSelect={(actionId) => onMenuAction?.(node, actionId)}
              >
                <Settings size={14} />
              </BrowserMenu>
            </div>
          );
        }

        const open = expanded.has(node.id);
        const active = selectedId === node.id;
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const menuItems = menuForNode?.(node) ?? [];
        return (
          <div key={node.id}>
            <div
              className={`flex w-full items-center rounded-md ${
                active ? "bg-[#2a2a2a] text-white" : "text-neutral-200 hover:bg-[#2a2a2a]"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (isWorkspace) {
                    onSelect(node.id);
                  }
                  if (hasChildren) {
                    onToggle(node.id);
                  }
                }}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                style={{ paddingLeft: rowPad(depth) }}
              >
                <span className="shrink-0 text-neutral-500">
                  {open ? <FolderOpen size={14} /> : <Folder size={14} />}
                </span>
                <span className="truncate">{node.label}</span>
              </button>
              {menuItems.length > 0 ? (
                <BrowserMenu
                  items={menuItems}
                  label="Open menu"
                  placement="left"
                  className="mr-0.5 shrink-0 rounded-md p-1 text-neutral-400 hover:bg-[#3a3a3a] hover:text-white"
                  onSelect={(actionId) => onMenuAction?.(node, actionId)}
                >
                  <Settings size={14} />
                </BrowserMenu>
              ) : null}
            </div>
            {open && hasChildren ? (
              <BrowserTree
                nodes={node.children ?? []}
                depth={depth + 1}
                expanded={expanded}
                selectedId={selectedId}
                onToggle={onToggle}
                onSelect={onSelect}
                menuForNode={menuForNode}
                onMenuAction={onMenuAction}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}
