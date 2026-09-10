import type { CatalogId } from '../settings/types';

export type GlobalPanelId =
  | 'history'
  | 'workspace'
  | 'agent'
  | 'outliner'
  | 'promptCompiler';

export type ChromeMode =
  | { kind: 'idle' }
  | { kind: 'menu' }
  | { kind: 'globalPanel'; id: GlobalPanelId }
  | { kind: 'toolConfig' }
  | { kind: 'settings'; catalogId: CatalogId; initialSectionId?: string };

export type OpenSettingsArgs = {
  catalogId: CatalogId;
  initialSectionId?: string;
};
