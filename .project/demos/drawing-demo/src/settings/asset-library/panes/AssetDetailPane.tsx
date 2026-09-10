import { useState } from 'react';
import { SettingsPaneScroll } from '../../pane/SettingsPaneScroll';
import { SettingsDestructiveTextButton } from '../../shell/SettingsDestructiveTextButton';
import { SettingsExpandableEntryHeader } from '../../shell/SettingsExpandableEntryHeader';
import { SettingsSection } from '../../shell/SettingsSection';
import type { LibraryAsset } from '../types';

type AssetDetailPaneProps = {
  asset: LibraryAsset;
  onAddContent: () => void;
  onRemove: () => void;
};

export function AssetDetailPane({ asset, onAddContent, onRemove }: AssetDetailPaneProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SettingsPaneScroll className="min-h-0 flex-1 overflow-y-auto p-3">
        <SettingsSection
          divided={false}
          footer={
            <button
              type="button"
              onClick={onAddContent}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-[#519aba] transition-colors hover:border-gray-400"
            >
              Add Content
            </button>
          }
        >
          {asset.contents.length === 0 ? (
            <p className="px-2 py-4 text-xs text-gray-400">No content yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {asset.contents.map((item) => {
                const expanded = expandedIds.has(item.id);
                const elements = item.elements ?? [];
                return (
                  <li key={item.id}>
                    <SettingsExpandableEntryHeader
                      expanded={expanded}
                      onToggle={() => toggleExpanded(item.id)}
                      toggleEntireRow
                      toggleAriaLabel={
                        expanded ? `Collapse ${item.name}` : `Expand ${item.name}`
                      }
                      label={item.name}
                    />
                    {expanded && elements.length > 0 ? (
                      <ul className="space-y-1 px-3 pb-2 pl-5">
                        {elements.map((element) => (
                          <li key={element} className="truncate text-xs text-gray-500">
                            {element}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SettingsSection>
      </SettingsPaneScroll>

      <footer className="shrink-0 border-t border-gray-200 bg-white px-3 py-2">
        <SettingsDestructiveTextButton onClick={onRemove}>
          Remove Asset
        </SettingsDestructiveTextButton>
      </footer>
    </div>
  );
}
