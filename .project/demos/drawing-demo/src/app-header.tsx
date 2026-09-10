import { ChevronDown, Eraser, Layers, Palette, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import closeIconUrl from './assets/close.svg';
import logoUrl from './assets/logo.svg';
import maximizeIconUrl from './assets/maximize.svg';
import minimizeIconUrl from './assets/minimize.svg';
import type { ActiveTool } from './authoring/types';
import {
  CHROME_BLOCKED_BUTTON_CLASS,
  chromeTriggerClass,
  type ChromeAccess,
} from './chrome';
import {
  UNTITLED_DOCUMENT_LABEL,
  UNTITLED_GRAPH_LABEL,
} from './authoring/document';
import {
  breadcrumbSegments,
  type BreadcrumbSurface,
} from './app-header/breadcrumbSegments';
import { canvasSurfacePresentation } from './app-header/surfacePresentation';
import { InlineRenameLabel } from './components/InlineRenameLabel';
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from './window';
import { isTauri } from './tauri-env';

export type MainMenuAction =
  | 'new-document'
  | 'new-window'
  | 'save-changes'
  | 'asset-library'
  | 'provider-server'
  | 'preferences'
  | 'defaults'
  | 'quit';

type MenuItem = {
  action: MainMenuAction;
  label: string;
  dividerAfter?: boolean;
  emphasis?: boolean;
};

const menuItems: MenuItem[] = [
  { action: 'new-document', label: 'New Document' },
  { action: 'new-window', label: 'New Window' },
  { action: 'save-changes', label: 'Save Changes', dividerAfter: true },
  { action: 'asset-library', label: 'Asset Library', dividerAfter: true },
  { action: 'provider-server', label: 'Provider Servers' },
  { action: 'defaults', label: 'Session Defaults' },
  { action: 'preferences', label: 'Preferences', dividerAfter: true },
  { action: 'quit', label: 'Quit', emphasis: true },
];

type AppHeaderProps = {
  chromeAccess: ChromeAccess;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onOpenAbout: () => void;
  onMainMenuAction?: (action: MainMenuAction) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenHistory?: () => void;
  onOpenWorkspace?: () => void;
  onOpenToolConfig?: () => void;
  /** Input/output toggle (Select + promptable Node) — left of Tool Config. */
  ioControl?: ReactNode;
  /** Agent trigger owned by `agent/` — slotted here, not hardcoded. */
  agentControl?: ReactNode;
  activeTool?: ActiveTool;
  documentTitle?: string;
  graphTitle?: string;
  canvasTitle?: string | null;
  surface?: BreadcrumbSurface;
  onRenameDocument?: (title: string) => void;
  onRenameGraph?: (name: string) => void;
  onFocusGraph?: () => void;
};

const windowControlClass =
  'flex h-7 w-7 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100';

const WindowControls = () => {
  const onMinimize = () => {
    if (!isTauri()) return;
    minimizeWindow();
  };
  const onMaximize = () => {
    if (!isTauri()) return;
    toggleMaximizeWindow();
  };
  const onClose = () => {
    if (!isTauri()) return;
    closeWindow();
  };

  return (
    <div className="flex items-center" data-no-window-drag="">
      <button type="button" className={windowControlClass} title="Minimize" onClick={onMinimize}>
        <img src={minimizeIconUrl} alt="" className="h-3 w-3 opacity-70" />
      </button>
      <button type="button" className={windowControlClass} title="Maximize" onClick={onMaximize}>
        <img src={maximizeIconUrl} alt="" className="h-3 w-3 opacity-70" />
      </button>
      <button type="button" className={windowControlClass} title="Close" onClick={onClose}>
        <img src={closeIconUrl} alt="" className="h-3 w-3 opacity-70" />
      </button>
    </div>
  );
};

export const AppHeader = ({
  chromeAccess,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  onOpenAbout,
  onMainMenuAction,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onOpenHistory,
  onOpenWorkspace,
  onOpenToolConfig,
  ioControl,
  agentControl,
  activeTool,
  documentTitle = UNTITLED_DOCUMENT_LABEL,
  graphTitle = UNTITLED_GRAPH_LABEL,
  canvasTitle = null,
  surface = 'graph',
  onRenameDocument,
  onRenameGraph,
  onFocusGraph,
}: AppHeaderProps) => {
  const [menuLeft, setMenuLeft] = useState<number | null>(null);
  const [showToolbar, setShowToolbar] = useState(true);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const leftAnchorRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const breadcrumbRef = useRef<HTMLDivElement | null>(null);
  const rightClusterRef = useRef<HTMLDivElement | null>(null);

  const logoLive = chromeAccess.logoLive;
  const logoActive = chromeAccess.logoActive;
  const menuLive = chromeAccess.menuTriggerLive;
  const menuOwner = chromeAccess.menuOwner;
  const globalPanelOwnerId = chromeAccess.globalPanelOwnerId;
  const toolbarLive = chromeAccess.headerAuthoringLive;
  const breadcrumbLive = chromeAccess.headerAuthoringLive;
  const undoLive = toolbarLive && canUndo;
  const redoLive = toolbarLive && canRedo;
  const historyActive = globalPanelOwnerId === 'history';
  const workspaceActive = globalPanelOwnerId === 'workspace';
  const toolConfigActive = chromeAccess.toolConfigTriggerActive;
  const toolConfigLive = chromeAccess.toolConfigTriggerLive;
  const showToolConfig =
    activeTool === 'paint' || activeTool === 'erase' || activeTool === 'select';
  const ToolConfigIcon =
    activeTool === 'erase' ? Eraser : activeTool === 'select' ? Layers : Palette;

  useEffect(() => {
    if (!menuOpen) return;

    const left = menuRef.current?.getBoundingClientRect().left ?? 0;
    setMenuLeft(left);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onMenuClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen, onMenuClose]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const GAP = 12;

    const updateToolbarVisibility = () => {
      const leftAnchor = leftAnchorRef.current;
      const toolbar = toolbarRef.current;
      const breadcrumb = breadcrumbRef.current;
      const right = rightClusterRef.current;
      if (!leftAnchor || !toolbar || !breadcrumb || !right) return;

      // Measure intrinsic width while keeping the toolbar in the accessibility tree.
      // `invisible absolute` preserves scrollWidth; `hidden` (display:none) does not.
      const headerRect = header.getBoundingClientRect();
      const breadcrumbWidth = breadcrumb.scrollWidth;
      const breadcrumbLeft = headerRect.left + (headerRect.width - breadcrumbWidth) / 2;
      const toolbarWidth = toolbar.scrollWidth;
      const toolbarWouldEnd = leftAnchor.getBoundingClientRect().right + toolbarWidth;
      const rightLeft = right.getBoundingClientRect().left;
      const breadcrumbRight = breadcrumbLeft + breadcrumbWidth;

      const fitsBeforeBreadcrumb = toolbarWouldEnd + GAP <= breadcrumbLeft;
      const breadcrumbFitsBeforeRight = breadcrumbRight + GAP <= rightLeft;
      const next = fitsBeforeBreadcrumb && breadcrumbFitsBeforeRight;
      setShowToolbar((prev) => (prev === next ? prev : next));
    };

    updateToolbarVisibility();

    const observer = new ResizeObserver(updateToolbarVisibility);
    observer.observe(header);
    window.addEventListener('resize', updateToolbarVisibility);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateToolbarVisibility);
    };
  }, []);

  const handleMenuAction = (action: MainMenuAction) => {
    onMainMenuAction?.(action);
  };

  return (
    <div
      ref={headerRef}
      data-tauri-drag-region=""
      className="relative z-50 flex h-9 shrink-0 items-center justify-between border-b border-gray-200 bg-white pl-2 pr-0.5"
    >
      <div className="flex h-full items-center">
        <div ref={leftAnchorRef} className="flex h-full items-center">
          <div className="relative flex items-center gap-0.5" ref={menuRef}>
            <button
              type="button"
              tabIndex={logoLive ? 0 : -1}
              title="About Inpainter"
              aria-pressed={logoActive}
              disabled={!logoLive}
              className={`flex h-full items-center rounded-md p-1.5 transition-colors ${chromeTriggerClass(
                logoLive,
                logoActive,
              )}`}
              onClick={() => {
                if (!logoLive) return;
                onOpenAbout();
              }}
              onKeyDown={(event) => {
                if (!logoLive) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpenAbout();
                }
              }}
            >
              <img src={logoUrl} alt="Inpainter" className="h-6 w-6 rounded-md" />
            </button>

            <button
              type="button"
              tabIndex={menuLive ? 0 : -1}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-pressed={menuOwner}
              title="Main menu"
              disabled={!menuLive}
              className={`flex h-full items-center rounded-md px-1 py-1.5 transition-colors ${chromeTriggerClass(
                menuLive,
                menuOwner,
              )}`}
              onClick={() => {
                if (!menuLive) return;
                onMenuToggle();
              }}
              onKeyDown={(event) => {
                if (!menuLive) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onMenuToggle();
                }
              }}
            >
              <ChevronDown size={14} strokeWidth={2.5} className="text-gray-700" />
            </button>

            {menuOpen && menuLeft !== null && (
              <div
                role="menu"
                className="fixed z-[100] min-w-[180px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                style={{ top: 44.5, left: menuLeft }}
              >
                <ol>
                  {menuItems.map((item) => (
                    <li key={item.action}>
                      <button
                        type="button"
                        role="menuitem"
                        className={`block w-full truncate px-3 py-1.5 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50 ${
                          item.emphasis ? 'font-semibold' : 'font-normal'
                        }`}
                        onClick={() => handleMenuAction(item.action)}
                      >
                        {item.label}
                      </button>
                      {item.dividerAfter && <div className="my-1 h-px bg-gray-100" />}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <div className="mx-1.5 h-5 w-px bg-gray-200" />
        </div>

        <div
          ref={toolbarRef}
          className={`flex items-center ${
            showToolbar ? '' : 'invisible absolute pointer-events-none'
          }`}
          aria-hidden={!showToolbar}
        >
          <div className="flex items-center gap-0.5 whitespace-nowrap text-xs font-medium text-gray-600">
            <button
              type="button"
              className={`rounded-md p-1 transition-colors ${
                undoLive
                  ? 'cursor-pointer hover:bg-gray-100'
                  : 'cursor-not-allowed opacity-35'
              }`}
              title="Undo"
              disabled={!undoLive}
              onClick={() => {
                if (!undoLive) return;
                onUndo?.();
              }}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              className={`rounded-md p-1 transition-colors ${
                redoLive
                  ? 'cursor-pointer hover:bg-gray-100'
                  : 'cursor-not-allowed opacity-35'
              }`}
              title="Redo"
              disabled={!redoLive}
              onClick={() => {
                if (!redoLive) return;
                onRedo?.();
              }}
            >
              <Redo2 size={16} />
            </button>
            <div className="mx-1 h-3.5 w-px bg-gray-200" />
            <button
              type="button"
              disabled={!toolbarLive && !historyActive}
              aria-pressed={historyActive}
              className={`rounded-md px-2 py-1 transition-colors ${chromeTriggerClass(
                toolbarLive || historyActive,
                historyActive,
              )}`}
              onClick={() => {
                if (!toolbarLive && !historyActive) return;
                onOpenHistory?.();
              }}
            >
              History
            </button>
            <button
              type="button"
              disabled={!toolbarLive && !workspaceActive}
              aria-pressed={workspaceActive}
              className={`rounded-md px-2 py-1 transition-colors ${chromeTriggerClass(
                toolbarLive || workspaceActive,
                workspaceActive,
              )}`}
              onClick={() => {
                if (!toolbarLive && !workspaceActive) return;
                onOpenWorkspace?.();
              }}
            >
              Workspace
            </button>
          </div>
        </div>

        {/*
          When the undo/History/Workspace cluster hides for space, breadcrumb
          stays in this left flex and takes its place. When the cluster is
          visible, breadcrumb centers on the header (absolute vs header).
        */}
        <div
          ref={breadcrumbRef}
          className={`flex items-center ${
            showToolbar
              ? 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
              : ''
          } ${breadcrumbLive ? '' : CHROME_BLOCKED_BUTTON_CLASS}`}
        >
          <div className="flex items-center whitespace-nowrap text-xs font-medium text-gray-800">
            {breadcrumbSegments({
              surface,
              documentTitle,
              graphTitle,
              canvasTitle,
            }).map((segment, index) => {
              const separator =
                index === 0 || segment.id === 'canvas' ? null : (
                  <span className="mx-1.5 text-gray-300">/</span>
                );

              let body: ReactNode;
              if (segment.mode === 'rename') {
                body = (
                  <InlineRenameLabel
                    value={segment.label}
                    live={breadcrumbLive}
                    title={
                      segment.id === 'document'
                        ? 'Rename document'
                        : 'Rename graph'
                    }
                    onCommit={(next) => {
                      if (segment.id === 'document') {
                        onRenameDocument?.(next);
                        return;
                      }
                      onRenameGraph?.(next);
                    }}
                  />
                );
              } else if (segment.mode === 'navigate') {
                body = (
                  <button
                    type="button"
                    title="Back to graph"
                    disabled={!breadcrumbLive}
                    className={`rounded px-1 transition-colors ${
                      breadcrumbLive
                        ? 'cursor-pointer hover:bg-gray-100 hover:text-gray-600'
                        : 'cursor-not-allowed'
                    }`}
                    onClick={() => {
                      if (!breadcrumbLive) return;
                      onFocusGraph?.();
                    }}
                  >
                    {segment.label}
                  </button>
                );
              } else if (segment.id === 'canvas') {
                const CanvasIcon = canvasSurfacePresentation().Icon;
                body = (
                  <span
                    className="flex items-center px-0.5 text-gray-600"
                    title={segment.label}
                    aria-label={segment.label}
                  >
                    <CanvasIcon size={14} strokeWidth={2} aria-hidden />
                  </span>
                );
              } else {
                body = <span className="px-1">{segment.label}</span>;
              }

              return (
                <span key={segment.id} className="flex items-center">
                  {separator}
                  {body}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div ref={rightClusterRef} className="flex items-center">
        <div className="mx-1 flex items-center gap-0.5">
          {ioControl}
          {ioControl && showToolConfig ? (
            <div className="mx-0.5 h-5 w-px bg-gray-200" />
          ) : null}
          {showToolConfig ? (
            <button
              type="button"
              disabled={!toolConfigLive}
              aria-pressed={toolConfigActive}
              className={`rounded-md p-1 transition-colors ${
                toolConfigLive
                  ? `${chromeTriggerClass(true, toolConfigActive)} ${
                      toolConfigActive
                        ? 'text-black'
                        : 'text-gray-600 hover:text-black'
                    }`
                  : CHROME_BLOCKED_BUTTON_CLASS
              }`}
              title="Tool Config"
              onClick={() => {
                if (!toolConfigLive) return;
                onOpenToolConfig?.();
              }}
            >
              <ToolConfigIcon size={16} />
            </button>
          ) : null}
        </div>
        {(ioControl || showToolConfig) && agentControl ? (
          <div className="mx-0.5 h-5 w-px bg-gray-200" />
        ) : null}
        {agentControl}
        <div className="mx-0.5 h-5 w-px bg-gray-200" />
        <WindowControls />
      </div>
    </div>
  );
};
