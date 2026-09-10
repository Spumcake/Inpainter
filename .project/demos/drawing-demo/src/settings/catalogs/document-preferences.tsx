import type { SettingsCatalog } from '../types';
import {
  getDocumentPreferencesExtraDefaults,
  getDocumentPreferencesFieldDefault,
} from '../factory/loadDocumentPreferencesFactory';
import { EraserPreferencesPane } from './eraser-preferences-pane';
import { FramePreferencesPane } from './frame-preferences-pane';
import { OutputPreferencesPane } from './output-preferences-pane';
import { PalettePreferencesPane } from './palette-preferences-pane';
import { PressureCurvePane } from './pressure-curve-pane';

export const documentPreferencesCatalog: SettingsCatalog = {
  id: 'document-preferences',
  title: 'Preferences',
  nav: [
    { id: 'palette', label: 'Palette' },
    { id: 'eraser', label: 'Eraser' },
    { id: 'frame', label: 'Frame' },
    { id: 'output', label: 'Output' },
    { id: 'render', label: 'Render' },
    { id: 'stylus', label: 'Stylus' },
    { id: 'shortcuts', label: 'Shortcuts' },
  ],
  extraDefaults: getDocumentPreferencesExtraDefaults(),
  sections: {
    palette: {
      kind: 'custom',
      render: () => <PalettePreferencesPane />,
    },
    eraser: {
      kind: 'custom',
      render: () => <EraserPreferencesPane />,
    },
    frame: {
      kind: 'custom',
      render: (ctx) => <FramePreferencesPane {...ctx} />,
    },
    output: {
      kind: 'custom',
      render: (ctx) => <OutputPreferencesPane {...ctx} />,
    },
    render: {
      kind: 'fields',
      groups: [
        {
          fields: [
            {
              key: 'render.defaultProviderId',
              label: 'Default Provider',
              control: 'select',
              default: getDocumentPreferencesFieldDefault('render.defaultProviderId') ?? '',
              options: [
                { value: '', label: 'None' },
                { value: 'image-2-provider', label: 'image-2-provider' },
              ],
            },
          ],
        },
      ],
    },
    stylus: {
      kind: 'custom',
      render: (ctx) => <PressureCurvePane {...ctx} />,
    },
    shortcuts: {
      kind: 'fields',
      groups: [
        {
          fields: [
            {
              key: 'shortcuts.cut',
              label: 'Cut',
              control: 'text',
              default: String(
                getDocumentPreferencesExtraDefaults()['shortcuts.cut'] ??
                  'Mod+X',
              ),
            },
            {
              key: 'shortcuts.copy',
              label: 'Copy',
              control: 'text',
              default: String(
                getDocumentPreferencesExtraDefaults()['shortcuts.copy'] ??
                  'Mod+C',
              ),
            },
            {
              key: 'shortcuts.paste',
              label: 'Paste',
              control: 'text',
              default: String(
                getDocumentPreferencesExtraDefaults()['shortcuts.paste'] ??
                  'Mod+V',
              ),
            },
            {
              key: 'shortcuts.delete',
              label: 'Delete',
              control: 'text',
              default: String(
                getDocumentPreferencesExtraDefaults()['shortcuts.delete'] ??
                  'Delete',
              ),
            },
            {
              key: 'shortcuts.hide',
              label: 'Hide',
              control: 'text',
              default: String(
                getDocumentPreferencesExtraDefaults()['shortcuts.hide'] ??
                  'Mod+H',
              ),
            },
            {
              key: 'shortcuts.lock',
              label: 'Lock',
              control: 'text',
              default: String(
                getDocumentPreferencesExtraDefaults()['shortcuts.lock'] ??
                  'Mod+L',
              ),
            },
            {
              key: 'shortcuts.group',
              label: 'Group',
              control: 'text',
              default: String(
                getDocumentPreferencesExtraDefaults()['shortcuts.group'] ??
                  'Mod+G',
              ),
            },
            {
              key: 'shortcuts.ungroup',
              label: 'Ungroup',
              control: 'text',
              default: String(
                getDocumentPreferencesExtraDefaults()['shortcuts.ungroup'] ??
                  'Mod+Shift+G',
              ),
            },
          ],
        },
      ],
    },
  },
};
