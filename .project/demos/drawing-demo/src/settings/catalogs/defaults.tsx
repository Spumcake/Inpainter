import type { SettingsCatalog } from '../types';
import { DefaultsPreferencesPane } from './defaults-preferences-pane';

export const defaultsCatalog: SettingsCatalog = {
  id: 'defaults',
  title: 'Session Defaults',
  nav: [{ id: 'defaults', label: 'Preferences' }],
  sections: {
    defaults: {
      kind: 'custom',
      render: () => <DefaultsPreferencesPane />,
    },
  },
};
