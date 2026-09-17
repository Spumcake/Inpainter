import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type DestinationId =
  | "projects"
  | "installs"
  | "providers"
  | "resources"
  | "guides"
  | "studio";

export type IconButtonProps = {
  icon: LucideIcon;
  onClick?: () => void;
  className?: string;
};

export type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
};

export type MenuAction = {
  id: string;
  label: string;
  icon: string;
};

export type DestinationNavItem = {
  id: DestinationId;
  label: string;
  icon: string;
  sectionMenu?: MenuAction[];
};

export type BrandPayload = {
  name: string;
};

export type UpdateBannerPayload = {
  title: string;
  body: string;
};

export type BrowserShellPayload = {
  brand: BrandPayload;
  destinations: DestinationNavItem[];
  selectedDestination: DestinationId;
  chrome: {
    updateBanner: UpdateBannerPayload | null;
  };
};

export type WorkspaceAgent = {
  id: string;
  name: string;
  directory?: string;
  status?: string;
  modified?: string;
};

export type WorkspaceTool = {
  id: string;
  label: string;
  path: string;
};

export type WorkspaceTreeNode = {
  id: string;
  label: string;
  kind: "workspace" | "folder" | "file" | string;
  path: string;
  agents: WorkspaceAgent[];
  tools?: WorkspaceTool[];
  children?: WorkspaceTreeNode[];
};

export type WorkspaceBrowserTab = {
  id: string;
  label: string;
  builtin?: boolean;
  path?: string;
  agents: WorkspaceAgent[];
  tools?: WorkspaceTool[];
};

export type WorkspaceBrowserPane = {
  tree: WorkspaceTreeNode[];
  emptyMessage: string;
  emptyDescription: string;
};

export type WorkspaceBrowserDestinationContent = {
  kind: "workspaceBrowser";
  tabs: WorkspaceBrowserTab[];
  selectedTab: string;
  canAddTab: boolean;
  panes: Record<string, WorkspaceBrowserPane>;
};

export type SkillTreeNode = {
  id: string;
  label: string;
  kind: "folder" | "skill" | string;
  children?: SkillTreeNode[];
  path?: string;
  title?: string | null;
  description?: string | null;
};

export type SkillBrowserTab = {
  id: string;
  label: string;
};

export type SkillBrowserPane = {
  tree: SkillTreeNode[];
  emptyMessage: string;
  emptyDescription: string;
};

export type SkillBrowserDestinationContent = {
  kind: "skillBrowser";
  tabs: SkillBrowserTab[];
  selectedTab: string;
  panes: Record<string, SkillBrowserPane>;
};

export type PlaceholderAction = {
  id: string;
  label: string;
  icon: string;
  tone: "accent" | "neutral" | string;
  available: boolean;
  unavailableReason?: string | null;
};

export type PlaceholderDestinationContent = {
  kind: "placeholder";
  title?: string | null;
  message: string;
  actions: PlaceholderAction[];
};

export type DestinationContent =
  | WorkspaceBrowserDestinationContent
  | SkillBrowserDestinationContent
  | PlaceholderDestinationContent;

export type DestinationContentPayload = {
  destinationId: DestinationId;
  content: DestinationContent;
};

export type SettingsCategory = {
  id: string;
  label: string;
};

export type SettingsPathField = {
  kind: "path";
  id: string;
  title: string;
  description: string;
  value: string;
};

export type SettingsNumberField = {
  kind: "number";
  id: string;
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
};

export type SettingsBoolField = {
  kind: "bool";
  id: string;
  title: string;
  description: string;
  value: boolean;
  label: string;
};

export type SettingsPlaceholderField = {
  kind: "placeholder";
  message: string;
};

export type SettingsField =
  | SettingsPathField
  | SettingsNumberField
  | SettingsBoolField
  | SettingsPlaceholderField;

export type SettingsPanel = {
  categoryId: string;
  fields: SettingsField[];
};

export type SettingsPayload = {
  title: string;
  versionLabel: string;
  categories: SettingsCategory[];
  selectedCategory: string;
  panel: SettingsPanel;
};

export type PrimaryNavigationProps = {
  destinations: DestinationNavItem[];
  brandName: string;
  activeDestination: DestinationId;
  setActiveDestination: (destination: DestinationId) => void;
  openSettings: () => void;
  onSectionAction: (action: string, destination: DestinationId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  ready: boolean;
};

export type SettingsModalProps = {
  onClose: () => void;
};

export type BrowserModalKind = "settings" | "projects.new" | "installs.add";

export type FloatingSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export type PlaceholderDestinationViewProps = {
  content: PlaceholderDestinationContent;
  onAction?: (actionId: string) => void;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  path: string;
};
