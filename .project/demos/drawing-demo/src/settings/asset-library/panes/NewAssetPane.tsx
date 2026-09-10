import { useState, type FormEvent } from 'react';
import { SETTINGS_CONTROL_INPUT_CLASS } from '../../controls/ControlRenderer';
import { SettingsPaneScroll } from '../../pane/SettingsPaneScroll';
import { SettingsRow } from '../../shell/SettingsRow';
import { SettingsSection } from '../../shell/SettingsSection';

type NewAssetPaneProps = {
  onAdd: (name: string) => void;
};

export function NewAssetPane({ onAdd }: NewAssetPaneProps) {
  const [name, setName] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim());
    setName('');
  };

  return (
    <SettingsPaneScroll>
      <SettingsSection
        footer={
          <button
            type="submit"
            form="new-asset-form"
            disabled={!name.trim()}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add
          </button>
        }
      >
        <form id="new-asset-form" onSubmit={handleSubmit}>
          <SettingsRow label="Name">
            <input
              id="asset-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={`${SETTINGS_CONTROL_INPUT_CLASS} w-48`}
              placeholder="Character, location, style…"
            />
          </SettingsRow>
        </form>
      </SettingsSection>
    </SettingsPaneScroll>
  );
}
