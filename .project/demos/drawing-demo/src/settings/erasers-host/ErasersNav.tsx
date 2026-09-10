import type { EraserTip } from '../eraser/types';
import {
  SETTINGS_NAV_ITEM_ACTIVE,
  SETTINGS_NAV_ITEM_DEFAULT,
  SETTINGS_NAV_NEW_CTA,
} from '../shell/settingsNavStyles';

type ErasersNavProps = {
  tips: EraserTip[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function ErasersNav({
  tips,
  activeId,
  onSelect,
  onNew,
}: ErasersNavProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <button
        type="button"
        onClick={onNew}
        className={SETTINGS_NAV_NEW_CTA}
      >
        New Eraser
      </button>

      <nav className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-gray-200 pt-2">
        <div className="flex flex-col gap-0.5">
          {tips.map((tip) => {
            const isActive = activeId === tip.id;
            return (
              <button
                key={tip.id}
                type="button"
                onClick={() => onSelect(tip.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                  isActive ? SETTINGS_NAV_ITEM_ACTIVE : SETTINGS_NAV_ITEM_DEFAULT
                }`}
              >
                <span className="min-w-0 truncate">{tip.name}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
