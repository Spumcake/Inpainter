import { invoke } from "@tauri-apps/api/core";
import type {
  BrowserShellPayload,
  DestinationContentPayload,
  DestinationId,
  SettingsPayload,
  WorkspaceRecord,
  WorkspaceAgent,
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

export async function getWorkspacesDir(): Promise<string> {
  if (isTauri()) {
    return invoke<string>("get_workspaces_dir");
  }
  return "/tmp/inpainter-workspaces";
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
}): Promise<WorkspaceRecord> {
  if (!isTauri()) {
    throw new Error(launcherOnly);
  }
  return invoke<WorkspaceRecord>("create_workspace", input);
}

export async function addWorkspace(path: string): Promise<WorkspaceRecord> {
  if (!isTauri()) {
    throw new Error(launcherOnly);
  }
  return invoke<WorkspaceRecord>("add_workspace", { path });
}

export async function removeWorkspace(id: string): Promise<void> {
  if (!isTauri()) {
    throw new Error(launcherOnly);
  }
  await invoke("remove_workspace", { id });
}

export async function createAgent(input: {
  workspaceId: string;
  directory?: string;
}): Promise<WorkspaceAgent> {
  if (!isTauri()) {
    throw new Error(launcherOnly);
  }
  return invoke<WorkspaceAgent>("create_agent", input);
}

export async function revealFolder(path: string): Promise<void> {
  if (!isTauri()) {
    throw new Error(launcherOnly);
  }
  await invoke("reveal_folder", { path });
}

export async function readTextFile(path: string): Promise<string> {
  if (!isTauri()) {
    if (path.endsWith("workspace.json")) {
          return JSON.stringify(
        {
          id: "preview-workspace",
          name: "Example workspace",
          slug: "example-workspace",
          created: "2026-01-01T12:00:00.000Z",
          modified: "2026-01-01T12:00:00.000Z",
          inpainter: "pre-alpha",
        },
        null,
        2,
      );
    }
    throw new Error(launcherOnly);
  }
  return invoke<string>("read_text_file", { path });
}

export async function openWorkspace(project: { id: string; path: string }): Promise<void> {
  if (!isTauri()) {
    throw new Error(launcherOnly);
  }
  await invoke("open_workspace", {
    workspaceId: project.id,
    workspacePath: project.path,
  });
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
        sectionMenu: [{ id: "projects.new", label: "New Workspace", icon: "plus" }],
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
        kind: "workspaceBrowser",
        tabs: [
          {
            id: "local",
            label: "Local",
            builtin: true,
            path: "/tmp/local",
            agents: [
              { id: "color-grade", name: "Color grade", directory: "/tmp/local", status: "Idle", modified: "2026-09-16T14:33:00.000Z" },
              { id: "night-exterior", name: "Night exterior", directory: "/tmp/local", status: "Idle", modified: "2026-09-15T21:05:00.000Z" },
              { id: "costume-reference", name: "Costume reference", directory: "/tmp/local", status: "Idle", modified: "2026-09-14T16:42:00.000Z" },
              { id: "opening-sequence", name: "Opening sequence", directory: "/tmp/local", status: "Idle", modified: "2026-09-12T10:18:00.000Z" },
            ],
            tools: [
              { id: "canvas.tool.json", label: "Canvas View", path: "/tmp/local/.inpainter/tools/canvas.tool.json" },
              { id: "editor.tool.json", label: "Editor View", path: "/tmp/local/.inpainter/tools/editor.tool.json" },
              { id: "session.tool.json", label: "Session View", path: "/tmp/local/.inpainter/tools/session.tool.json" },
            ],
          },
        ],
        selectedTab: "local",
        canAddTab: true,
        panes: {
          local: {
            tree: [
              {
                id: "local/.inpainter",
                label: ".inpainter",
                kind: "folder",
                path: "/tmp/local/.inpainter",
                agents: [],
                children: [
                  {
                    id: "local/.inpainter/workspace.json",
                    label: "workspace.json",
                    kind: "file",
                    path: "/tmp/local/.inpainter/workspace.json",
                    agents: [],
                  },
                ],
              },
            ],
            emptyMessage: "",
            emptyDescription: "",
          },
        },
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
