import type { ChromeMode, GlobalPanelId, OpenSettingsArgs } from './types';
import { isToolSettingsCatalog } from './toolSettingsCatalogs';

export function closeChrome(): ChromeMode {
  return { kind: 'idle' };
}

export function openMenu(mode: ChromeMode): ChromeMode {
  if (
    mode.kind === 'idle' ||
    mode.kind === 'settings' ||
    mode.kind === 'toolConfig'
  ) {
    return { kind: 'menu' };
  }

  if (mode.kind === 'menu') {
    return { kind: 'idle' };
  }

  return mode;
}

export function openGlobalPanel(
  mode: ChromeMode,
  id: GlobalPanelId,
): ChromeMode {
  if (mode.kind === 'settings') {
    return mode;
  }

  if (mode.kind === 'globalPanel' && mode.id === id) {
    return closeChrome();
  }

  return { kind: 'globalPanel', id };
}

export function openToolConfig(mode: ChromeMode): ChromeMode {
  if (mode.kind === 'settings') {
    // Tool Config dismisses tool-settings hosts (Palettes / Erasers / …).
    if (isToolSettingsCatalog(mode.catalogId)) {
      return closeChrome();
    }
    return mode;
  }

  if (mode.kind === 'toolConfig') {
    return closeChrome();
  }

  return { kind: 'toolConfig' };
}

export function openSettings(mode: ChromeMode, args: OpenSettingsArgs): ChromeMode {
  if (mode.kind === 'settings') {
    if (
      mode.catalogId === args.catalogId &&
      mode.initialSectionId === args.initialSectionId
    ) {
      return { kind: 'idle' };
    }

    return {
      kind: 'settings',
      catalogId: args.catalogId,
      initialSectionId: args.initialSectionId,
    };
  }

  return {
    kind: 'settings',
    catalogId: args.catalogId,
    initialSectionId: args.initialSectionId,
  };
}

export function isGlobalPanelId(value: string): value is GlobalPanelId {
  return (
    value === 'history' ||
    value === 'workspace' ||
    value === 'agent' ||
    value === 'outliner' ||
    value === 'promptCompiler'
  );
}
