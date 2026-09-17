import { useEffect, useState } from "react";
import { ExternalLink, FolderClosed, Monitor, Plus } from "lucide-react";
import SplitBrowserLayout from "../shared/SplitBrowserLayout";
import { pickDirectory, revealFolder } from "../shared/browserApi";
import type { MenuAction, WorkspaceAgent, WorkspaceBrowserDestinationContent } from "../shared/types";

const WORKSPACE_TAB_MENU: MenuAction[] = [
  { id: "reveal", label: "Show in Files", icon: "folder" },
];

const ADDED_WORKSPACE_TAB_MENU: MenuAction[] = [
  ...WORKSPACE_TAB_MENU,
  { id: "remove", label: "Remove", icon: "x" },
];

function formatModified(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function agentNodeId(workspaceId: string, agentId: string) {
  return `${workspaceId}/agents/${agentId}`;
}

function AgentsTable({
  agents,
  workspaceId,
  workspacePath,
  selectedId,
  onSelectAgent,
  onCreateAgent,
}: {
  agents: WorkspaceAgent[];
  workspaceId: string;
  workspacePath: string;
  selectedId: string | null;
  onSelectAgent: (id: string) => void;
  onCreateAgent: (directory: string) => void;
}) {
  const [createDirectory, setCreateDirectory] = useState(workspacePath);
  const columns = "grid-cols-[minmax(10rem,1fr)_minmax(14rem,1.8fr)_minmax(8rem,0.7fr)_minmax(11rem,0.9fr)]";

  useEffect(() => {
    setCreateDirectory(workspacePath);
  }, [workspacePath]);

  const browseCreateDirectory = async () => {
    try {
      const selected = await pickDirectory();
      if (selected) setCreateDirectory(selected);
    } catch {
      // Keep the current directory if the picker is cancelled or unavailable.
    }
  };

  return (
    <div className="text-sm">
      <div className={`grid ${columns} gap-x-8 border-b border-[#333] px-2 text-xs font-medium text-neutral-400`}>
        <div className="pb-2 font-medium">Agent</div>
        <div className="pb-2 font-medium">Directory</div>
        <div className="pb-2 font-medium">Status</div>
        <div className="pb-2 font-medium">Modified</div>
      </div>
      <div
        className={`grid w-full ${columns} gap-x-8 items-center rounded-md border-b border-[#2a2a2a] px-2 py-1.5 text-neutral-400`}
      >
        <button
          type="button"
          onClick={() => onCreateAgent(createDirectory || workspacePath)}
          className="flex min-w-0 items-center gap-2 pr-4 text-left hover:text-neutral-200"
        >
          <span className="shrink-0 text-neutral-500">
            <Plus size={14} />
          </span>
          <span className="truncate">Create Agent</span>
        </button>
        <button
          type="button"
          onClick={() => void browseCreateDirectory()}
          title={createDirectory || workspacePath}
          className="flex min-w-0 items-center gap-2 pr-4 text-left text-xs text-neutral-400 hover:text-neutral-200"
        >
          <FolderClosed size={12} className="shrink-0" />
          <span className="truncate">{createDirectory || workspacePath}</span>
        </button>
        <span className="text-xs text-neutral-500">N/A</span>
        <span className="text-xs text-neutral-500">N/A</span>
      </div>
      {agents.map((agent) => {
        const id = agentNodeId(workspaceId, agent.id);
        const active = selectedId === id;
        const directory = agent.directory || workspacePath;
        return (
          <button
            key={agent.id}
            type="button"
            onClick={() => onSelectAgent(id)}
            className={`grid w-full ${columns} gap-x-8 items-center rounded-md border-b border-[#2a2a2a] px-2 py-1.5 text-left ${
              active ? "bg-[#2a2a2a] text-white" : "text-neutral-200 hover:bg-[#2a2a2a]"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2 pr-4">
              <span className="shrink-0 text-neutral-500">
                <Monitor size={14} />
              </span>
              <span className="truncate">{agent.name}</span>
            </span>
            <span className="truncate text-xs text-neutral-400" title={directory}>
              {directory}
            </span>
            <span className="truncate text-xs text-neutral-400">{agent.status ?? "Idle"}</span>
            <span className="text-xs text-neutral-400">{formatModified(agent.modified)}</span>
          </button>
        );
      })}
    </div>
  );
}

type ProjectsBrowserViewProps = {
  content: WorkspaceBrowserDestinationContent;
  activeTab: string;
  opening?: boolean;
  onTabChange: (id: string) => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (id: string) => void;
  onCreateAgent: (workspaceId: string, directory: string) => void;
  onOpenWorkspace: (workspace: { id: string; path: string }) => void;
};

export default function ProjectsBrowserView({
  content,
  activeTab,
  opening = false,
  onTabChange,
  onAddWorkspace,
  onRemoveWorkspace,
  onCreateAgent,
  onOpenWorkspace,
}: ProjectsBrowserViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTab = content.tabs.find((tab) => tab.id === activeTab) ?? content.tabs[0] ?? null;

  useEffect(() => {
    if (!content.tabs.some((tab) => tab.id === activeTab) && content.tabs[0]) {
      onTabChange(content.tabs[0].id);
    }
  }, [activeTab, content.tabs, onTabChange]);

  useEffect(() => {
    setSelectedId(null);
  }, [selectedTab?.id]);

  const launchSelected = () => {
    if (!selectedTab || opening) return;
    onOpenWorkspace({ id: selectedTab.id, path: selectedTab.path ?? "" });
  };

  return (
    <SplitBrowserLayout
      tabs={content.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        menu: tab.builtin ? WORKSPACE_TAB_MENU : ADDED_WORKSPACE_TAB_MENU,
        onMenuAction: (actionId: string) => {
          if (actionId === "reveal" && tab.path) {
            void revealFolder(tab.path);
          }
          if (actionId === "remove") {
            onRemoveWorkspace(tab.id);
          }
        },
      }))}
      activeTab={selectedTab?.id ?? activeTab}
      onSelectTab={onTabChange}
      tabExtra={
        content.canAddTab ? (
          <button
            type="button"
            aria-label="Add workspace folder"
            onClick={onAddWorkspace}
            className="pb-2 text-neutral-400 hover:text-white"
          >
            <Plus size={16} />
          </button>
        ) : null
      }
      tabTrailing={
        <button
          type="button"
          disabled={!selectedTab || opening}
          onClick={launchSelected}
          className="inline-flex items-center gap-2 rounded border border-neutral-600 px-4 py-1.5 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-400 hover:text-white disabled:opacity-40"
        >
          Launch Workspace
          <ExternalLink size={14} />
        </button>
      }
      hideLeft
      right={
        selectedTab ? (
          <AgentsTable
            agents={selectedTab.agents ?? []}
            workspaceId={selectedTab.id}
            workspacePath={selectedTab.path ?? ""}
            selectedId={selectedId}
            onSelectAgent={setSelectedId}
            onCreateAgent={(directory) => onCreateAgent(selectedTab.id, directory)}
          />
        ) : (
          <p className="px-2 text-sm text-neutral-400">
            Create a workspace or add an existing folder to get started.
          </p>
        )
      }
    />
  );
}
