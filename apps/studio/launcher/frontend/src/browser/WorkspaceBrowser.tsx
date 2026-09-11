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
  getBrowserShell,
  getDestinationContent,
  importWorkspace,
  launchStudio,
  pickDirectory,
  removeWorkspace,
} from "./shared/browserApi";
import type {
  BrowserModalKind,
  BrowserShellPayload,
  DestinationContent,
  DestinationId,
  Project,
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
    if (contentCache[destinationId]) return;

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

  const openSettings = () => setOpenModal("settings");
  const closeModal = () => setOpenModal(null);

  const refreshProjects = () => {
    setActiveDestination("projects");
    setContentCache((prev) => {
      const next = { ...prev };
      delete next.projects;
      return next;
    });
  };

  const handleImport = async () => {
    setActionError(null);
    try {
      const selected = await pickDirectory();
      if (!selected) return;
      await importWorkspace(selected);
      refreshProjects();
    } catch (err: unknown) {
      setActionError(errorMessage(err));
    }
  };

  const handleAction = (actionId: string, destination: DestinationId) => {
    if (actionId === "projects.new" || actionId === "installs.add") {
      setActionError(null);
      setOpenModal(actionId);
      return;
    }
    if (actionId === "projects.import") {
      void handleImport();
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

  const handleProjectCreated = () => {
    setOpenModal(null);
    setActionError(null);
    refreshProjects();
  };

  const handleRowAction = (actionId: string, project: Project) => {
    if (actionId !== "projects.remove") return;
    setActionError(null);
    void removeWorkspace(project.id)
      .then(() => refreshProjects())
      .catch((err: unknown) => setActionError(errorMessage(err)));
  };

  const handleOpenProject = () => {
    void launchStudio().catch((err: unknown) => {
      setActionError(errorMessage(err));
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
          onPlaceholderAction={handlePlaceholderAction}
          onOpenProject={handleOpenProject}
          onRowAction={handleRowAction}
        />

        {openModal === "settings" ? <SettingsModal onClose={closeModal} /> : null}
        {openModal === "projects.new" ? (
          <BrowserModal title="New workspace" onClose={closeModal} className="w-[520px] h-auto">
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
  onPlaceholderAction,
  onOpenProject,
  onRowAction,
}: {
  destination: DestinationId;
  content: DestinationContent | undefined;
  error: string | null;
  actionError: string | null;
  onPlaceholderAction: (actionId: string) => void;
  onOpenProject: () => void;
  onRowAction: (actionId: string, project: Project) => void;
}) {
  if (error && !content) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1c1c1c] text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!content) {
    if (destination === "installs") return <InstallsListSkeleton />;
    return <PlaceholderDestinationSkeleton />;
  }

  const body =
    content.kind === "table" ? (
      <ProjectsBrowserView
        content={content}
        onOpenProject={() => onOpenProject()}
        onRowAction={onRowAction}
      />
    ) : content.kind === "skillBrowser" ? (
      <InstallsBrowserView content={content} />
    ) : (
      <PlaceholderDestinationView content={content} onAction={onPlaceholderAction} />
    );

  return (
    <div className="relative flex-1 flex min-w-0">
      {body}
      {actionError ? (
        <p className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded bg-black/60 px-3 py-1.5 text-sm text-red-400">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
