import {
  Crop,
  Eraser,
  Frame,
  Keyboard,
  Palette,
  PenTool,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { SettingsPaneScroll } from '../pane/SettingsPaneScroll';
import { settingsStore } from '../store/settingsStore';
import { SettingsRow } from '../shell/SettingsRow';
import { SettingsSection } from '../shell/SettingsSection';
import { defaultEraserStore } from '../eraser/defaultEraserStore';
import { defaultPaletteStore } from '../palette/defaultPaletteStore';
import {
  FRAME_KEYS,
  getPreferencesSectionDirtyState,
  OUTPUT_KEYS,
  RENDER_KEYS,
  SHORTCUT_KEYS,
  STYLUS_KEYS,
  type PreferencesSectionId,
} from './documentPreferencesSectionDirty';

const CATALOG_ID = 'document-preferences';

type DefaultsCategory = {
  id: PreferencesSectionId;
  label: string;
  icon: ReactNode;
  onReset: () => void;
};

function resetKeys(keys: readonly string[]): void {
  for (const key of keys) {
    settingsStore.resetKey(CATALOG_ID, key);
  }
}

const CATEGORIES: DefaultsCategory[] = [
  {
    id: 'palette',
    label: 'Palette',
    icon: <Palette size={16} strokeWidth={2} aria-hidden />,
    onReset: () => defaultPaletteStore.resetToFactory(),
  },
  {
    id: 'eraser',
    label: 'Eraser',
    icon: <Eraser size={16} strokeWidth={2} aria-hidden />,
    onReset: () => defaultEraserStore.resetToFactory(),
  },
  {
    id: 'frame',
    label: 'Frame',
    icon: <Crop size={16} strokeWidth={2} aria-hidden />,
    onReset: () => resetKeys(FRAME_KEYS),
  },
  {
    id: 'output',
    label: 'Output',
    icon: <Frame size={16} strokeWidth={2} aria-hidden />,
    onReset: () => resetKeys(OUTPUT_KEYS),
  },
  {
    id: 'render',
    label: 'Render',
    icon: <Sparkles size={16} strokeWidth={2} aria-hidden />,
    onReset: () => resetKeys(RENDER_KEYS),
  },
  {
    id: 'stylus',
    label: 'Stylus',
    icon: <PenTool size={16} strokeWidth={2} aria-hidden />,
    onReset: () => resetKeys(STYLUS_KEYS),
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: <Keyboard size={16} strokeWidth={2} aria-hidden />,
    onReset: () => resetKeys(SHORTCUT_KEYS),
  },
];

function usePreferencesSectionDirtyState(): Record<PreferencesSectionId, boolean> {
  const [dirty, setDirty] = useState(getPreferencesSectionDirtyState);

  useEffect(() => {
    const sync = () => setDirty(getPreferencesSectionDirtyState());
    sync();
    const unsubSettings = settingsStore.subscribe(sync);
    const unsubPalette = defaultPaletteStore.subscribe(sync);
    const unsubEraser = defaultEraserStore.subscribe(sync);
    return () => {
      unsubSettings();
      unsubPalette();
      unsubEraser();
    };
  }, []);

  return dirty;
}

export function DefaultsPreferencesPane() {
  const dirty = usePreferencesSectionDirtyState();

  return (
    <SettingsPaneScroll>
      <SettingsSection>
        {CATEGORIES.map((category) => {
          const canReset = dirty[category.id];

          return (
            <SettingsRow
              key={category.id}
              label={category.label}
              icon={category.icon}
            >
              <button
                type="button"
                onClick={category.onReset}
                disabled={!canReset}
                className="h-7 rounded-md border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-gray-50"
              >
                Reset to Default
              </button>
            </SettingsRow>
          );
        })}
      </SettingsSection>
    </SettingsPaneScroll>
  );
}
