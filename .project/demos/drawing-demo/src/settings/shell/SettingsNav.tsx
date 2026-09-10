import type { SettingsNavItem } from '../types';
import {
  SETTINGS_NAV_ITEM_ACTIVE,
  SETTINGS_NAV_ITEM_DEFAULT,
} from './settingsNavStyles';

type SettingsNavProps = {
  items: SettingsNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
};

export function SettingsNav({ items, activeId, onSelect }: SettingsNavProps) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
              isActive ? SETTINGS_NAV_ITEM_ACTIVE : SETTINGS_NAV_ITEM_DEFAULT
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
