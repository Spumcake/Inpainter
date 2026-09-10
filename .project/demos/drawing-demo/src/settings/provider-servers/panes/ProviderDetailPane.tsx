import { SettingsPaneScroll } from '../../pane/SettingsPaneScroll';
import { SettingsRow } from '../../shell/SettingsRow';
import { SettingsSection } from '../../shell/SettingsSection';
import type { ProviderRecord } from '../types';

type ProviderDetailPaneProps = {
  provider: ProviderRecord;
};

export function ProviderDetailPane({ provider }: ProviderDetailPaneProps) {
  return (
    <SettingsPaneScroll>
      <SettingsSection>
        <SettingsRow label="Provider id">
          <span className="font-mono text-sm text-gray-900">{provider.provider_id}</span>
        </SettingsRow>
        <SettingsRow label="Base URL">
          <span className="max-w-[14rem] break-all text-right font-mono text-sm text-gray-900">
            {provider.base_url}
          </span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection>
        {provider.capabilities.length === 0 ? (
          <p className="px-2 py-2 text-xs text-gray-500">
            No capabilities registered for this provider.
          </p>
        ) : (
          provider.capabilities.map((capability) => (
            <div key={capability.id} className="px-2 py-2">
              <div className="text-sm font-medium text-gray-900">{capability.id}</div>
              <div className="mt-0.5 text-xs text-gray-500">trigger: {capability.trigger}</div>
              {capability.notes ? (
                <div className="mt-1 text-xs text-gray-500">{capability.notes}</div>
              ) : null}
            </div>
          ))
        )}
      </SettingsSection>

      <p className="text-xs text-gray-500">
        Per-Document provider settings will render here once providers expose a settings schema.
        Connection and API keys are configured in tray Provider Config.
      </p>
    </SettingsPaneScroll>
  );
}
