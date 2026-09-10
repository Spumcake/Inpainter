import type { SettingsFieldDef } from '../types';

export const brushSizeField: SettingsFieldDef = {
  key: 'size',
  label: 'Size',
  control: 'slider',
  default: 4,
  min: 1,
  max: 40,
  step: 1,
};

export const brushOpacityField: SettingsFieldDef = {
  key: 'opacity',
  label: 'Opacity',
  control: 'slider',
  default: 1,
  min: 0,
  max: 1,
  step: 0.05,
};

export const brushSmoothingField: SettingsFieldDef = {
  key: 'smoothing',
  label: 'Smoothing',
  control: 'slider',
  default: 0.5,
  min: 0,
  max: 1,
  step: 0.05,
};
