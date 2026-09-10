import type { ChromeMode, GlobalPanelId } from './types';
import { isToolSettingsCatalog } from './toolSettingsCatalogs';

export type ChromeAccess = {
  headerAuthoringLive: boolean;
  /** Logo stays Live in settings, menu, and tool config (About / menu replace paths). */
  logoLive: boolean;
  /**
   * Pressed look for the brand control. True when About owns settings, or when the
   * main-menu cluster owns the window (logo + chevron share one Owner).
   */
  logoActive: boolean;
  /** Chevron stays Live in settings and tool config so the menu can replace. */
  menuTriggerLive: boolean;
  /** Main menu is the blocking Owner — chevron (and logo) show pressed. */
  menuOwner: boolean;
  /** Which Global Panel trigger is Owner, if any — only that trigger is pressed. */
  globalPanelOwnerId: GlobalPanelId | null;
  /**
   * Tool Config header trigger stays Live (and shows pressed) while its strip panel
   * is open **or** while a tool-settings host (Palettes / Erasers / …) is open so
   * the same button can dismiss.
   */
  toolConfigTriggerLive: boolean;
  toolConfigTriggerActive: boolean;
  canvasLive: boolean;
  /**
   * Whether the bottom toolbar accepts tool clicks.
   * Live while idle, and while Tool Config strip panel is open (paint ↔ erase swap).
   */
  toolbarLive: boolean;
  /**
   * Whether the bottom toolbar advertises the latched tool chip.
   * Cleared for most blocking modes; kept for Tool Config strip panel (settings host still clears it).
   */
  toolbarShowActiveTool: boolean;
  windowControlsLive: true;
};

export function deriveChromeAccess(mode: ChromeMode): ChromeAccess {
  const menuOwner = mode.kind === 'menu';
  const aboutOwner =
    mode.kind === 'settings' && mode.catalogId === 'about';
  /** Tool Config strip keeps brand/menu Live (escape hatch) — Global Panels do not. */
  const presetPickerOpen = mode.kind === 'toolConfig';
  /** Prompt Compiler is opened from the PE ellipsis — keep toolbar Live so toggle dismiss works. */
  const promptCompilerOpen =
    mode.kind === 'globalPanel' && mode.id === 'promptCompiler';
  const toolSettingsOpen =
    mode.kind === 'settings' && isToolSettingsCatalog(mode.catalogId);
  const toolConfigTriggerActive = presetPickerOpen || toolSettingsOpen;

  return {
    headerAuthoringLive: mode.kind === 'idle',
    logoLive:
      mode.kind === 'idle' ||
      mode.kind === 'settings' ||
      mode.kind === 'menu' ||
      presetPickerOpen,
    logoActive: menuOwner || aboutOwner,
    menuTriggerLive:
      mode.kind === 'idle' ||
      mode.kind === 'settings' ||
      mode.kind === 'menu' ||
      presetPickerOpen,
    menuOwner,
    globalPanelOwnerId: mode.kind === 'globalPanel' ? mode.id : null,
    toolConfigTriggerLive:
      mode.kind === 'idle' || toolConfigTriggerActive,
    toolConfigTriggerActive,
    canvasLive: mode.kind === 'idle',
    toolbarLive:
      mode.kind === 'idle' || presetPickerOpen || promptCompilerOpen,
    toolbarShowActiveTool: mode.kind === 'idle' || presetPickerOpen,
    windowControlsLive: true,
  };
}

/** Shared pressed fill for header Owner triggers (matches hover language). */
export const CHROME_TRIGGER_ACTIVE_CLASS = 'bg-gray-100';

export const CHROME_BLOCKED_BUTTON_CLASS =
  'cursor-not-allowed opacity-35 pointer-events-none';

export function chromeInteractiveClass(
  live: boolean,
  liveClass = 'cursor-pointer hover:bg-gray-100',
): string {
  return live ? liveClass : CHROME_BLOCKED_BUTTON_CLASS;
}

/** Live trigger: optional Owner pressed fill; Blocked: unavailable look. */
export function chromeTriggerClass(live: boolean, active: boolean): string {
  if (!live) {
    return CHROME_BLOCKED_BUTTON_CLASS;
  }
  if (active) {
    return `cursor-pointer ${CHROME_TRIGGER_ACTIVE_CLASS}`;
  }
  return 'cursor-pointer hover:bg-gray-100';
}
