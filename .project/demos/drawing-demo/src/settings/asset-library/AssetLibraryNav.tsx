import type { LibraryAsset } from './types';
import { NEW_ASSET_ID } from './types';
import {
  SETTINGS_NAV_ITEM_ACTIVE,
  SETTINGS_NAV_ITEM_DEFAULT,
  SETTINGS_NAV_NEW_CTA,
} from '../shell/settingsNavStyles';

type AssetLibraryNavProps = {
  assets: LibraryAsset[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function AssetLibraryNav({
  assets,
  activeId,
  onSelect,
  onNew,
}: AssetLibraryNavProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <button
        type="button"
        onClick={() => {
          onNew();
          onSelect(NEW_ASSET_ID);
        }}
        className={SETTINGS_NAV_NEW_CTA}
      >
        New Asset
      </button>

      <nav className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-gray-200 pt-2">
        <div className="flex flex-col gap-0.5">
          {assets.map((asset) => {
            const isActive = activeId === asset.id;
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelect(asset.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                  isActive ? SETTINGS_NAV_ITEM_ACTIVE : SETTINGS_NAV_ITEM_DEFAULT
                }`}
              >
                <span className="min-w-0 truncate">{asset.name}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
