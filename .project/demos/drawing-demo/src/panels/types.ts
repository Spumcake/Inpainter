export type GlobalPanelId =
  | 'history'
  | 'workspace'
  | 'agent'
  | 'outliner'
  | 'promptCompiler';

export type GlobalPanelListItem = {
  id: string;
  label: string;
  meta?: string;
  isActive?: boolean;
  isFuture?: boolean;
  onSelect: () => void;
};

/** @deprecated Prefer GlobalPanelListItem */
export type HeaderListItem = GlobalPanelListItem;

/** @deprecated Prefer GlobalPanelId */
export type HeaderPanelId = 'history' | 'workspace';
