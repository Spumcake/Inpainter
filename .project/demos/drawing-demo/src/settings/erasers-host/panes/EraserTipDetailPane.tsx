import { useEffect, useRef, useState } from 'react';
import { ControlRenderer, SETTINGS_CONTROL_INPUT_CLASS } from '../../controls/ControlRenderer';
import {
  documentEraserStore,
  eraserSizeField,
  type EraserTip,
} from '../../eraser';
import { SettingsPaneScroll } from '../../pane/SettingsPaneScroll';
import { SettingsDestructiveTextButton } from '../../shell/SettingsDestructiveTextButton';
import { SettingsRow } from '../../shell/SettingsRow';
import { SettingsSection } from '../../shell/SettingsSection';

type EraserTipDetailPaneProps = {
  tip: EraserTip;
  canRemove: boolean;
  onRemove: () => void;
};

export function EraserTipDetailPane({
  tip,
  canRemove,
  onRemove,
}: EraserTipDetailPaneProps) {
  const [nameDraft, setNameDraft] = useState(tip.name);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameDraft(tip.name);
  }, [tip.id, tip.name]);

  const commitName = () => {
    const next = nameDraft.trim();
    if (next && next !== tip.name) {
      documentEraserStore.renameTip(tip.id, next);
    } else {
      setNameDraft(tip.name);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 border-b border-gray-200 px-3 py-2">
        <input
          ref={nameInputRef}
          type="text"
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              setNameDraft(tip.name);
              event.currentTarget.blur();
            }
          }}
          className={`${SETTINGS_CONTROL_INPUT_CLASS} w-full font-medium`}
          aria-label="Eraser name"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => documentEraserStore.resetTipToDefault(tip.id)}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-[#519aba] transition-colors hover:border-gray-400"
          >
            Revert to default
          </button>
        </div>
      </div>

      <SettingsPaneScroll className="min-h-0 flex-1 overflow-y-auto p-3">
        <SettingsSection>
          <SettingsRow label={eraserSizeField.label}>
            <ControlRenderer
              field={eraserSizeField}
              value={tip.size}
              onChange={(value) => {
                if (typeof value !== 'number') return;
                documentEraserStore.patchTip(tip.id, { size: value });
              }}
            />
          </SettingsRow>
        </SettingsSection>
      </SettingsPaneScroll>

      <footer className="shrink-0 border-t border-gray-200 bg-white px-3 py-2">
        <SettingsDestructiveTextButton disabled={!canRemove} onClick={onRemove}>
          Remove Eraser
        </SettingsDestructiveTextButton>
      </footer>
    </div>
  );
}
