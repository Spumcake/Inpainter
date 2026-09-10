import type { DocumentPalette } from '../palette/types';
import {
  SETTINGS_NAV_ITEM_ACTIVE,
  SETTINGS_NAV_ITEM_DEFAULT,
  SETTINGS_NAV_NEW_CTA,
} from '../shell/settingsNavStyles';

type PalettesNavProps = {
  palettes: DocumentPalette[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  canCreate?: boolean;
};

export function PalettesNav({
  palettes,
  activeId,
  onSelect,
  onNew,
  canCreate = true,
}: PalettesNavProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <button
        type="button"
        onClick={onNew}
        disabled={!canCreate}
        className={SETTINGS_NAV_NEW_CTA}
      >
        New Palette
      </button>

      <nav className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-gray-200 pt-2">
        <div className="flex flex-col gap-0.5">
          {palettes.map((palette) => {
            const isActive = activeId === palette.id;
            return (
              <button
                key={palette.id}
                type="button"
                onClick={() => onSelect(palette.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                  isActive ? SETTINGS_NAV_ITEM_ACTIVE : SETTINGS_NAV_ITEM_DEFAULT
                }`}
              >
                <span className="min-w-0 truncate">{palette.name}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
