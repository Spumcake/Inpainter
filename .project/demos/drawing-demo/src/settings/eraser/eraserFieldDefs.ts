import type { SettingsFieldDef } from '../types';

/** Eraser tip size — wider range than brush size (brush max is 40). */
export const eraserSizeField: SettingsFieldDef = {
  key: 'size',
  label: 'Size',
  control: 'slider',
  default: 4,
  min: 1,
  max: 256,
  step: 1,
};
