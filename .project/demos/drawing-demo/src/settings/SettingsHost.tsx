import { useEffect, useState } from 'react';
import { SettingsNav } from './shell/SettingsNav';
import { SettingsPane } from './pane/SettingsPane';
import { SettingsShell, type SettingsShellLayout } from './shell/SettingsShell';
import type { SettingsCatalogId } from './catalogIds';
import { getCatalog } from './catalogs';

type SettingsHostProps = {
  catalogId: SettingsCatalogId;
  initialSectionId?: string;
  onClose: () => void;
  layout?: SettingsShellLayout;
  /** Fitted-modal initial height; forwarded to `SettingsShell`. */
  defaultHeight?: number;
};

export function SettingsHost({
  catalogId,
  initialSectionId,
  onClose,
  layout = 'modal',
  defaultHeight,
}: SettingsHostProps) {
  const catalog = getCatalog(catalogId);
  const [activeSectionId, setActiveSectionId] = useState(
    initialSectionId ?? catalog.nav[0]?.id ?? '',
  );

  useEffect(() => {
    if (initialSectionId) {
      setActiveSectionId(initialSectionId);
    }
  }, [initialSectionId]);

  return (
    <SettingsShell
      title={catalog.title}
      onClose={onClose}
      layout={layout}
      defaultHeight={defaultHeight}
      nav={
        <SettingsNav
          items={catalog.nav}
          activeId={activeSectionId}
          onSelect={setActiveSectionId}
        />
      }
    >
      <SettingsPane catalogId={catalog.id} catalog={catalog} sectionId={activeSectionId} />
    </SettingsShell>
  );
}
