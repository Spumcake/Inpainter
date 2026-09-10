import { isSettingsCatalogId } from '../catalogIds';
import { getCatalog } from '../catalogs';
import { resolveKitchenSinkSection } from '../catalogs/kitchen-sink';
import { settingsStore, useCatalogValues } from '../store/settingsStore';
import type { SettingsCatalog, SettingValue } from '../types';
import { FieldsContent } from './FieldsContent';
import { SettingsPaneScroll } from './SettingsPaneScroll';

type SettingsPaneProps = {
  catalogId: string;
  catalog: SettingsCatalog;
  sectionId: string;
};

function resolvePaneContext(
  hostCatalogId: string,
  hostCatalog: SettingsCatalog,
  hostSectionId: string,
): { valueCatalogId: string; valueCatalog: SettingsCatalog; sectionId: string } {
  if (hostCatalogId === 'debug-kitchen-sink') {
    const resolved = resolveKitchenSinkSection(hostSectionId);
    if (!isSettingsCatalogId(resolved.catalogId)) {
      throw new Error(`Unknown kitchen-sink catalog: ${resolved.catalogId}`);
    }
    return {
      valueCatalogId: resolved.catalogId,
      valueCatalog: getCatalog(resolved.catalogId),
      sectionId: resolved.sectionId,
    };
  }

  return {
    valueCatalogId: hostCatalogId,
    valueCatalog: hostCatalog,
    sectionId: hostSectionId,
  };
}

export function SettingsPane({ catalogId, catalog, sectionId }: SettingsPaneProps) {
  const { valueCatalogId, valueCatalog, sectionId: resolvedSectionId } = resolvePaneContext(
    catalogId,
    catalog,
    sectionId,
  );
  const values = useCatalogValues(valueCatalogId, valueCatalog);
  const section = valueCatalog.sections[resolvedSectionId];

  const patch = (partial: Record<string, SettingValue>) => {
    settingsStore.patch(valueCatalogId, partial);
  };

  if (!section) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
        Section not found.
      </div>
    );
  }

  if (section.kind === 'custom') {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {section.render({ values, patch })}
      </div>
    );
  }

  return (
    <SettingsPaneScroll>
      {section.groups.map((group, index) => (
        <FieldsContent
          key={group.title ?? index}
          fields={group.fields}
          values={values}
          onPatch={patch}
          sectionTitle={group.title}
        />
      ))}
    </SettingsPaneScroll>
  );
}
