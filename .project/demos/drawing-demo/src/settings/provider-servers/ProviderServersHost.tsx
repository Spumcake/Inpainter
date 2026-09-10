import { useEffect, useState } from 'react';
import { SettingsNav } from '../shell/SettingsNav';
import { SettingsShell } from '../shell/SettingsShell';
import { fetchRegisteredProviders } from './pipeProviders';
import { ProviderDetailPane } from './panes/ProviderDetailPane';
import type { ProviderRecord } from './types';

type ProviderServersHostProps = {
  onClose: () => void;
};

export function ProviderServersHost({ onClose }: ProviderServersHostProps) {
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void fetchRegisteredProviders().then((result) => {
      if (cancelled) return;
      setProviders(result.providers);
      setActiveId(result.providers[0]?.provider_id ?? '');
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const activeProvider = providers.find((provider) => provider.provider_id === activeId);

  const renderPane = () => {
    if (loading) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-gray-500">
          Loading providers…
        </div>
      );
    }

    if (providers.length === 0) {
      return null;
    }

    if (!activeProvider) {
      return null;
    }

    return <ProviderDetailPane provider={activeProvider} />;
  };

  return (
    <SettingsShell
      title="Provider Servers"
      onClose={onClose}
      nav={
        providers.length > 0 ? (
          <SettingsNav
            items={providers.map((provider) => ({
              id: provider.provider_id,
              label: provider.provider_id,
            }))}
            activeId={activeId}
            onSelect={setActiveId}
          />
        ) : (
          <div className="px-3 py-2 text-xs text-gray-500">No Providers</div>
        )
      }
    >
      {renderPane()}
    </SettingsShell>
  );
}
