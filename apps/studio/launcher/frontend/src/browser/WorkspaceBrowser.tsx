import { useEffect, useState } from "react";
import GlobalWindowControls from "./chrome/GlobalWindowControls";
import UpdateBanner from "./chrome/UpdateBanner";
import UpdateBannerSkeleton from "./chrome/UpdateBannerSkeleton";
import InstallsBrowserView from "./installs/InstallsBrowserView";
import InstallsListSkeleton from "./installs/InstallsListSkeleton";
import PlaceholderDestinationView, {
  PlaceholderDestinationSkeleton,
} from "./navigation/PlaceholderDestinationView";
import PrimaryNavigation from "./navigation/PrimaryNavigation";
import CreateProjectForm from "./projects/CreateProjectForm";
import ProjectsBrowserView from "./projects/ProjectsBrowserView";
import SettingsModal from "./settings/SettingsModal";
import BrowserModal, { BrowserModalBody } from "./shared/BrowserModal";
import {
  addWorkspace,
  createAgent,
  getBrowserShell,
  getDestinationContent,
  openWorkspace,
  pickDirectory,
  removeWorkspace,
} from "./shared/browserApi";
import type {
  BrowserModalKind,
  BrowserShellPayload,
  DestinationContent,
  DestinationId,
  WorkspaceRecord,
} from "./shared/types";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

export default function WorkspaceBrowser() {
  const [shell, setShell] = useState<BrowserShellPayload | null>(null);
  const [shellError, setShellError] = useState<string | null>(null);
  const [activeDestination, setActiveDestination] = useState<DestinationId>("projects");
  const [contentCache, setContentCache] = useState<Partial<Record<DestinationId, DestinationContent>>>({});
  const [openModal, setOpenModal] = useState<BrowserModalKind | null>(null);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [activeWorkspaceTabId, setActiveWorkspaceTabId] = useState("local");
  const [projectsRevision, setProjectsRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getBrowserShell()
      .then((payload) => {
        if (cancelled) return;
        setShell(payload);
        setActiveDestination(payload.selectedDestination);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setShellError(err instanceof Error ? err.message : "Failed to load browser");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!shell) return;
    const destinationId = activeDestination;
    if (destinationId === "projects" || contentCache[destinationId]) return;

    let cancelled = false;
    getDestinationContent(destinationId)
      .then((payload) => {
        if (cancelled) return;
        setContentCache((prev) => ({ ...prev, [destinationId]: payload.content }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setContentCache((prev) => ({
          ...prev,
          [destinationId]: {
            kind: "placeholder",
            message: err instanceof Error ? err.message : "Failed to load destination",
            actions: [],
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [shell, activeDestination, contentCache]);

  useEffect(() => {
    const refresh = () => setProjectsRevision((revision) => revision + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    if (!shell || activeDestination !== "projects") return;
    let cancelled = false;
    getDestinationContent("projects")
      .then((payload) => {
        if (cancelled) return;
        setContentCache((prev) => ({ ...prev, projects: payload.content }));
        if (payload.content.kind === "workspaceBrowser") {
          const selectedTab = payload.content.selectedTab;
          setActiveWorkspaceTabId((current) => current || selectedTab);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setContentCache((prev) => ({
          ...prev,
          projects: { kind: "placeholder", message: errorMessage(err), actions: [] },
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [shell, activeDestination, projectsRevision]);

  const openSettings = () => setOpenModal("settings");
  const closeModal = () => setOpenModal(null);

  const refreshProjects = () => {
    setActiveDestination("projects");
    setProjectsRevision((revision) => revision + 1);
  };

  const handleAction = (actionId: string, destination: DestinationId) => {
    if (actionId === "projects.new" || actionId === "installs.add") {
      setActionError(null);
      setOpenModal(actionId);
      return;
    }
    setActiveDestination(destination);
  };

  const handleSectionAction = (action: string, destination: DestinationId) => {
    handleAction(action, destination);
  };

  const handlePlaceholderAction = (actionId: string) => {
    handleAction(actionId, activeDestination);
  };

  const handleProjectCreated = (workspace: WorkspaceRecord) => {
    setOpenModal(null);
    setActionError(null);
    setActiveWorkspaceTabId(workspace.id);
    refreshProjects();
  };

  const handleAddWorkspace = async () => {
    setActionError(null);
    try {
      const selected = await pickDirectory();
      if (!selected) return;
      const workspace = await addWorkspace(selected);
      setActiveWorkspaceTabId(workspace.id);
      refreshProjects();
    } catch (err: unknown) {
      setActionError(errorMessage(err));
    }
  };

  const handleRemoveWorkspace = async (id: string) => {
    setActionError(null);
    try {
      await removeWorkspace(id);
      if (activeWorkspaceTabId === id) {
        setActiveWorkspaceTabId("");
      }
      refreshProjects();
    } catch (err: unknown) {
      setActionError(errorMessage(err));
    }
  };

  const handleCreateAgent = async (workspaceId: string, directory: string) => {
    setActionError(null);
    try {
      await createAgent({ workspaceId, directory });
      refreshProjects();
    } catch (err: unknown) {
      setActionError(errorMessage(err));
    }
  };

  const launchWorkspace = (workspace: { id: string; path: string }) => {
    if (opening) return;
    setActionError(null);
    setOpening(true);
    void openWorkspace({ id: workspace.id, path: workspace.path })
      .catch((err: unknown) => {
        setActionError(errorMessage(err));
      })
      .finally(() => {
        setOpening(false);
      });
  };

  const shellReady = shell !== null;
  const destinationContent = contentCache[activeDestination];
  const updateBanner = shell?.chrome.updateBanner ?? null;

  return (
    <div className="flex flex-col h-screen w-full bg-[#121212] font-sans overflow-hidden select-none">
      <GlobalWindowControls />
      {!shellReady && !shellError ? <UpdateBannerSkeleton /> : null}
      {updateBanner && !bannerDismissed ? (
        <UpdateBanner banner={updateBanner} onDismiss={() => setBannerDismissed(true)} />
      ) : null}

      <div className="flex flex-1 overflow-hidden relative">
        <PrimaryNavigation
          destinations={shell?.destinations ?? []}
          brandName={shell?.brand.name ?? "Inpainter"}
          activeDestination={activeDestination}
          setActiveDestination={setActiveDestination}
          openSettings={openSettings}
          onSectionAction={handleSectionAction}
          collapsed={navigationCollapsed}
          onToggleCollapsed={() => setNavigationCollapsed((open) => !open)}
          ready={shellReady}
        />

        <DestinationPlane
          destination={activeDestination}
          content={destinationContent}
          error={shellError}
          actionError={actionError}
          opening={opening}
          activeWorkspaceTabId={activeWorkspaceTabId}
          onPlaceholderAction={handlePlaceholderAction}
          onTabChange={setActiveWorkspaceTabId}
          onAddWorkspace={() => void handleAddWorkspace()}
          onRemoveWorkspace={(id) => void handleRemoveWorkspace(id)}
          onCreateAgent={(id, directory) => void handleCreateAgent(id, directory)}
          onOpenWorkspace={launchWorkspace}
        />

        {openModal === "settings" ? <SettingsModal onClose={closeModal} /> : null}
        {openModal === "projects.new" ? (
          <BrowserModal title="New Workspace" onClose={closeModal} className="w-[520px] h-auto">
            <CreateProjectForm onCreated={handleProjectCreated} />
          </BrowserModal>
        ) : null}
        {openModal === "installs.add" ? (
          <BrowserModal title="New install" onClose={closeModal}>
            <BrowserModalBody>Adding installs isn't implemented yet.</BrowserModalBody>
          </BrowserModal>
        ) : null}
      </div>
    </div>
  );
}

function DestinationPlane({
  destination,
  content,
  error,
  actionError,
  opening,
  activeWorkspaceTabId,
  onPlaceholderAction,
  onTabChange,
  onAddWorkspace,
  onRemoveWorkspace,
  onCreateAgent,
  onOpenWorkspace,
}: {
  destination: DestinationId;
  content: DestinationContent | undefined;
  error: string | null;
  actionError: string | null;
  opening: boolean;
  activeWorkspaceTabId: string;
  onPlaceholderAction: (actionId: string) => void;
  onTabChange: (id: string) => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (id: string) => void;
  onCreateAgent: (workspaceId: string, directory: string) => void;
  onOpenWorkspace: (workspace: { id: string; path: string }) => void;
}) {
  if (error && !content) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1c1c1c] text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!content) {
    if (destination === "installs" || destination === "projects") return <InstallsListSkeleton />;
    return <PlaceholderDestinationSkeleton />;
  }

  const body =
    content.kind === "workspaceBrowser" ? (
      <ProjectsBrowserView
        content={content}
        activeTab={activeWorkspaceTabId}
        opening={opening}
        onTabChange={onTabChange}
        onAddWorkspace={onAddWorkspace}
        onRemoveWorkspace={onRemoveWorkspace}
        onCreateAgent={onCreateAgent}
        onOpenWorkspace={onOpenWorkspace}
      />
    ) : content.kind === "skillBrowser" ? (
      <InstallsBrowserView content={content} />
    ) : (
      <PlaceholderDestinationView content={content} onAction={onPlaceholderAction} />
    );

  return (
    <div
      className={`relative flex min-w-0 flex-1 transition-opacity duration-200 ${
        opening ? "pointer-events-none opacity-40" : "opacity-100"
      }`}
    >
      {body}
      {actionError ? (
        <p className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded bg-black/60 px-3 py-1.5 text-sm text-red-400">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
