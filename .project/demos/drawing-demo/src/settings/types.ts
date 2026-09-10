import type { ReactNode } from 'react';

export type SettingValue = string | number | boolean | null;

export type ControlKind =
  | 'number'
  | 'boolean'
  | 'text'
  | 'select'
  | 'segmented'
  | 'slider'
  | 'password';

export type FieldOption = {
  value: string;
  label: string;
};

export type SettingsFieldDef = {
  key: string;
  label: string;
  description?: string;
  control: ControlKind;
  default: SettingValue;
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
};

export type SettingsFieldGroup = {
  title?: string;
  fields: SettingsFieldDef[];
};

export type CustomPaneContext = {
  values: Record<string, SettingValue>;
  patch: (partial: Record<string, SettingValue>) => void;
};

export type SettingsSectionDef =
  | { kind: 'fields'; groups: SettingsFieldGroup[] }
  | { kind: 'custom'; render: (ctx: CustomPaneContext) => ReactNode };

export type SettingsNavItem = {
  id: string;
  label: string;
};

export type SettingsCatalog = {
  id: string;
  title: string;
  nav: SettingsNavItem[];
  sections: Record<string, SettingsSectionDef>;
  /** Values for custom panes that are not declared as field defs */
  extraDefaults?: Record<string, SettingValue>;
};

export type CatalogId =
  | 'document-preferences'
  | 'defaults'
  | 'provider-servers'
  | 'asset-library'
  | 'palettes'
  | 'erasers'
  | 'about'
  | 'debug-kitchen-sink';
