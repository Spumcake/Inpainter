import { invoke } from "@tauri-apps/api/core";
import type {
  BrowserShellPayload,
  DestinationContentPayload,
  DestinationId,
  SettingsPayload,
  WorkspaceRecord,
} from "./types";

const LOAD_DELAY_MS = 800;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function getBrowserShell(): Promise<BrowserShellPayload> {
  if (isTauri()) {
    return invoke<BrowserShellPayload>("get_browser_shell");
  }
  await delay(LOAD_DELAY_MS);
  return vitePreviewShell();
}

export async function getDestinationContent(
  destinationId: DestinationId,
): Promise<DestinationContentPayload> {
  if (isTauri()) {
    return invoke<DestinationContentPayload>("get_destination_content", { destinationId });
  }
  await delay(LOAD_DELAY_MS);
  return vitePreviewDestination(destinationId);
}

export async function getSettings(categoryId?: string): Promise<SettingsPayload> {
  if (isTauri()) {
    return invoke<SettingsPayload>("get_settings", { categoryId: categoryId ?? null });
  }
  await delay(LOAD_DELAY_MS);
  return vitePreviewSettings(categoryId);
}

const launcherOnly = "This action is only available in the launcher.";

export async function getUserHome(): Promise<string> {
  if (isTauri()) {
    return invoke<string>("get_user_home");
  }
  return "";
}

export async function pickDirectory(): Promise<string | null> {
  if (!isTauri()) {
    throw new Error(launcherOnly);
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

export async function createWorkspace(input: {
  name: string;
  location: string;
  folderName: string;
}): Promise<WorkspaceRecord> {
  if (!isTauri()) {
    throw new Error(launcherOnly);
  }
  return invoke<WorkspaceRecord>("create_workspace", input);
}

export async function importWorkspace(path: string): Promise<WorkspaceRecord> {
  if (!isTauri()) {
    throw new Error(launcherOnly);
  }
  return invoke<WorkspaceRecord>("import_workspace", { path });
}

export async function removeWorkspace(id: string): Promise<void> {
  if (!isTauri()) {
    throw new Error(launcherOnly);
  }
  await invoke("remove_workspace", { id });
}

export async function launchStudio(): Promise<void> {
  if (!isTauri()) {
    throw new Error(launcherOnly);
  }
  await invoke("launch_studio");
}

function vitePreviewShell(): BrowserShellPayload {
  return {
    brand: { name: "Inpainter" },
    selectedDestination: "projects",
    destinations: [
      {
        id: "projects",
        label: "Workspaces",
        icon: "folder",
        sectionMenu: [
          { id: "projects.new", label: "New workspace", icon: "plus" },
          { id: "projects.import", label: "Import workspace", icon: "folder-plus" },
        ],
      },
      {
        id: "installs",
        label: "Installs",
        icon: "hard-drive",
        sectionMenu: [{ id: "installs.add", label: "New install", icon: "plus" }],
      },
      {
        id: "providers",
        label: "Providers",
        icon: "cloud",
        sectionMenu: [{ id: "providers.add", label: "New provider", icon: "plus" }],
      },
      { id: "resources", label: "Resources", icon: "book-open" },
      { id: "guides", label: "Guides", icon: "book" },
      { id: "studio", label: "Studio", icon: "box" },
    ],
    chrome: {
      updateBanner: {
        title: "Inpainter Studio 1.6 is now available.",
        body: "Upgrade for the latest updates and improvements.",
      },
    },
  };
}

function vitePreviewDestination(destinationId: DestinationId): DestinationContentPayload {
  if (destinationId === "projects") {
    return {
      destinationId,
      content: {
        kind: "placeholder",
        title: "No Workspaces",
        message: "Create a new workspace or import an existing one to get started.",
        actions: [
          {
            id: "projects.import",
            label: "Import workspaces",
            icon: "folder-plus",
            tone: "neutral",
            available: true,
          },
          {
            id: "projects.new",
            label: "New workspace",
            icon: "plus",
            tone: "accent",
            available: true,
          },
        ],
      },
    };
  }

  if (destinationId === "installs") {
    return {
      destinationId,
      content: {
        kind: "skillBrowser",
        tabs: [
          { id: "included", label: "Included" },
          { id: "custom", label: "Custom" },
        ],
        selectedTab: "included",
        panes: {
          included: {
            tree: [
              {
                id: "openai",
                label: "openai",
                kind: "folder",
                children: [
                  {
                    id: "openai/discuss.json",
                    label: "discuss",
                    kind: "skill",
                    title: "Discuss",
                    description: "Prompt-engineering content for the discuss skill will live here.",
                  },
                ],
              },
            ],
            emptyMessage: "No included skills.",
            emptyDescription: "Select a skill to see its description.",
          },
          custom: {
            tree: [],
            emptyMessage: "No custom skills.",
            emptyDescription: "Select a skill to see its description.",
          },
        },
      },
    };
  }

  const labels: Record<string, string> = {
    providers: "Providers",
    resources: "Resources",
    guides: "Guides",
    studio: "Studio",
  };

  return {
    destinationId,
    content: {
      kind: "placeholder",
      message: `Content for ${labels[destinationId] ?? destinationId} coming soon.`,
      actions: [],
    },
  };
}

function vitePreviewSettings(categoryId?: string): SettingsPayload {
  const categories = [
    { id: "projects", label: "Workspaces" },
    { id: "installs", label: "Installs" },
    { id: "templates", label: "Templates" },
    { id: "appearance", label: "Appearance" },
    { id: "notifications", label: "Notifications" },
    { id: "security", label: "Security & Privacy" },
    { id: "advanced", label: "Advanced" },
  ];
  const selectedCategory = categories.some((category) => category.id === categoryId)
    ? (categoryId as string)
    : "installs";
  const label = categories.find((category) => category.id === selectedCategory)?.label ?? "Settings";

  return {
    title: "Settings",
    versionLabel: "Unity Hub 3.18.2",
    categories,
    selectedCategory,
    panel: {
      categoryId: selectedCategory,
      fields:
        selectedCategory === "installs"
          ? [
              {
                kind: "path",
                id: "installsLocation",
                title: "Installs location",
                description:
                  "Choose a location for Editor and Learn installs. Existing installs will not be affected.",
                value: "/mnt/Hot/Resources/Unity/Editors",
              },
              {
                kind: "path",
                id: "downloadsLocation",
                title: "Downloads location",
                description: "Choose a location for Editor and Learn downloads.",
                value: "/home/david/.config/unityhub/downloads",
              },
              {
                kind: "number",
                id: "concurrentDownloads",
                title: "Concurrent downloads",
                description: "Set number of concurrent downloads within allowed 2-20 range.",
                value: 2,
                min: 2,
                max: 20,
              },
              {
                kind: "bool",
                id: "keepArchives",
                title: "Uninstall Editor",
                description: "Leave downloaded archives when uninstalling.",
                value: false,
                label: "Keep archives",
              },
            ]
          : [{ kind: "placeholder", message: `Settings for ${label} coming soon.` }],
    },
  };
}
