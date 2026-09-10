import logoUrl from '../../assets/logo.svg';
import { SettingsPaneScroll } from '../pane/SettingsPaneScroll';
import { SettingsInfoRow } from '../shell/SettingsInfoRow';
import { SettingsSection } from '../shell/SettingsSection';
import type { SettingsCatalog } from '../types';

const APP_VERSION = '0.1.0';

function AboutPane() {
  return (
    <SettingsPaneScroll>
      <SettingsSection>
        <div className="flex items-center gap-3 px-2 py-3">
          <img src={logoUrl} alt="" className="h-12 w-12 rounded-md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Inpainter</p>
            <p className="mt-0.5 text-xs text-gray-500">Version {APP_VERSION}</p>
          </div>
        </div>
        <SettingsInfoRow label="Description">
          <p className="text-right text-xs text-gray-400">
            AI-assisted graphics authoring. Generate, crop, and edit images across Documents,
            Graphs, and Canvases.
          </p>
        </SettingsInfoRow>
        <SettingsInfoRow label="Product">
          <p className="text-right text-xs text-gray-400">
            Desktop App · Web UI · Backend Service · Tray
          </p>
        </SettingsInfoRow>
      </SettingsSection>
    </SettingsPaneScroll>
  );
}

function ChangeLogPane() {
  return (
    <SettingsPaneScroll>
      <SettingsSection>
        <SettingsInfoRow label="0.1.0">
          <p className="text-right text-xs text-gray-400">
            Initial tray shell, Desktop window, Settings Frontend
          </p>
        </SettingsInfoRow>
      </SettingsSection>
    </SettingsPaneScroll>
  );
}

export const aboutCatalog: SettingsCatalog = {
  id: 'about',
  title: 'About Inpainter',
  nav: [
    { id: 'about', label: 'About Inpainter' },
    { id: 'changelog', label: 'Change Log' },
  ],
  sections: {
    about: {
      kind: 'custom',
      render: () => <AboutPane />,
    },
    changelog: {
      kind: 'custom',
      render: () => <ChangeLogPane />,
    },
  },
};
