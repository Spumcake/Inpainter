import { DOCUMENT_PREFERENCES_CATALOG_ID } from '../documentSettingsBridge';
import { defaultEraserStore } from '../eraser/defaultEraserStore';
import { defaultPaletteStore } from '../palette/defaultPaletteStore';
import { settingsStore } from '../store/settingsStore';
import { eraserHasOverrides } from '../utils/eraserFactoryMatch';
import { paletteHasOverrides } from '../utils/paletteFactoryMatch';

export type PreferencesSectionId =
  | 'palette'
  | 'eraser'
  | 'frame'
  | 'output'
  | 'render'
  | 'stylus'
  | 'shortcuts';

const FRAME_KEYS = ['frame.ratio', 'frame.defaultWidth', 'frame.defaultHeight'] as const;
const OUTPUT_KEYS = [
  'output.ratio',
  'output.defaultWidth',
  'output.defaultHeight',
] as const;
const RENDER_KEYS = ['render.defaultProviderId'] as const;
const STYLUS_KEYS = ['stylus.pressureCurveX', 'stylus.pressureCurveY'] as const;
const SHORTCUT_KEYS = [
  'shortcuts.cut',
  'shortcuts.copy',
  'shortcuts.paste',
  'shortcuts.delete',
  'shortcuts.hide',
  'shortcuts.lock',
  'shortcuts.group',
  'shortcuts.ungroup',
] as const;

function overridesHaveAnyKey(
  overrides: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return keys.some((key) => key in overrides);
}

export function sectionHasOverrides(sectionId: PreferencesSectionId): boolean {
  const overrides = settingsStore.getOverrides(DOCUMENT_PREFERENCES_CATALOG_ID);

  switch (sectionId) {
    case 'palette':
      return paletteHasOverrides(defaultPaletteStore.getBrushes());
    case 'eraser':
      return eraserHasOverrides(defaultEraserStore.getTips());
    case 'frame':
      return overridesHaveAnyKey(overrides, FRAME_KEYS);
    case 'output':
      return overridesHaveAnyKey(overrides, OUTPUT_KEYS);
    case 'render':
      return overridesHaveAnyKey(overrides, RENDER_KEYS);
    case 'stylus':
      return overridesHaveAnyKey(overrides, STYLUS_KEYS);
    case 'shortcuts':
      return overridesHaveAnyKey(overrides, SHORTCUT_KEYS);
  }
}

export function getPreferencesSectionDirtyState(): Record<
  PreferencesSectionId,
  boolean
> {
  return {
    palette: sectionHasOverrides('palette'),
    eraser: sectionHasOverrides('eraser'),
    frame: sectionHasOverrides('frame'),
    output: sectionHasOverrides('output'),
    render: sectionHasOverrides('render'),
    stylus: sectionHasOverrides('stylus'),
    shortcuts: sectionHasOverrides('shortcuts'),
  };
}

export { FRAME_KEYS, OUTPUT_KEYS, RENDER_KEYS, STYLUS_KEYS, SHORTCUT_KEYS };
