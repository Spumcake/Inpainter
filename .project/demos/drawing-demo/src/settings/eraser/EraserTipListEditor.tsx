import { useState } from 'react';
import { ControlRenderer } from '../controls/ControlRenderer';
import { SettingsPaneScroll } from '../pane/SettingsPaneScroll';
import { SettingsDestructiveTextButton } from '../shell/SettingsDestructiveTextButton';
import {
  SettingsExpandableEntryHeader,
  SettingsExpandableEntryName,
} from '../shell/SettingsExpandableEntryHeader';
import { SettingsExpandableFields } from '../shell/SettingsExpandableFields';
import { SettingsRow } from '../shell/SettingsRow';
import { SettingsSection } from '../shell/SettingsSection';
import { eraserSizeField } from './eraserFieldDefs';
import { eraserTipSlotDiameter } from './eraserTipVisual';
import type { EraserTip } from './types';

function TipSizePreview({ size }: { size: number }) {
  const diameter = eraserTipSlotDiameter(size, false);
  return (
    <span
      className="inline-block shrink-0 rounded-full border border-gray-300 bg-gray-200"
      style={{ width: diameter, height: diameter }}
      aria-hidden
    />
  );
}

function TipFields({
  tip,
  canRemove,
  onPatch,
  onRemove,
}: {
  tip: EraserTip;
  canRemove: boolean;
  onPatch: (partial: Partial<Omit<EraserTip, 'id'>>) => void;
  onRemove: () => void;
}) {
  return (
    <SettingsExpandableFields
      footer={
        <SettingsDestructiveTextButton disabled={!canRemove} onClick={onRemove}>
          Remove Eraser
        </SettingsDestructiveTextButton>
      }
    >
      <SettingsRow label={eraserSizeField.label}>
        <ControlRenderer
          field={eraserSizeField}
          value={tip.size}
          onChange={(value) =>
            onPatch({
              size: typeof value === 'number' ? value : Number(value),
            })
          }
        />
      </SettingsRow>
    </SettingsExpandableFields>
  );
}

export type EraserTipListEditorProps = {
  tips: EraserTip[];
  onPatchTip: (id: string, partial: Partial<Omit<EraserTip, 'id'>>) => void;
  onAddTip: () => string;
  onRemoveTip: (id: string) => void;
  className?: string;
};

/** Props-driven expandable eraser tip list editor (no store imports). */
export function EraserTipListEditor({
  tips,
  onPatchTip,
  onAddTip,
  onRemoveTip,
  className = 'flex min-h-0 flex-1 flex-col overflow-hidden',
}: EraserTipListEditorProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const canRemoveTip = tips.length > 1;

  const toggleExpanded = (id: string) => {
    if (editingNameId === id) return;
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
    <div className={className}>
      <SettingsPaneScroll className="min-h-0 flex-1 overflow-y-auto p-3">
        <SettingsSection
          divided={false}
          footer={
            <button
              type="button"
              onClick={() => {
                const id = onAddTip();
                setExpandedIds((prev) => new Set(prev).add(id));
                setEditingNameId(id);
              }}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-[#519aba] transition-colors hover:border-gray-400"
            >
              Add Eraser
            </button>
          }
        >
          {tips.length === 0 ? (
            <p className="px-2 py-4 text-xs text-gray-400">No erasers yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tips.map((tip) => {
                const expanded = expandedIds.has(tip.id);
                const editingName = editingNameId === tip.id;
                return (
                  <li key={tip.id}>
                    <SettingsExpandableEntryHeader
                      expanded={expanded}
                      onToggle={() => toggleExpanded(tip.id)}
                      toggleAriaLabel={
                        expanded ? `Collapse ${tip.name}` : `Expand ${tip.name}`
                      }
                      label={
                        <SettingsExpandableEntryName
                          name={tip.name}
                          editing={editingName}
                          onStartEdit={() => setEditingNameId(tip.id)}
                          onEndEdit={() => setEditingNameId(null)}
                          onRename={(name) => onPatchTip(tip.id, { name })}
                          ariaLabel="Eraser name"
                        />
                      }
                      preview={<TipSizePreview size={tip.size} />}
                    />
                    {expanded ? (
                      <TipFields
                        tip={tip}
                        canRemove={canRemoveTip}
                        onPatch={(partial) => onPatchTip(tip.id, partial)}
                        onRemove={() => {
                          onRemoveTip(tip.id);
                          setExpandedIds((prev) => {
                            const next = new Set(prev);
                            next.delete(tip.id);
                            return next;
                          });
                          if (editingNameId === tip.id) {
                            setEditingNameId(null);
                          }
                        }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SettingsSection>
      </SettingsPaneScroll>
    </div>
  );
}
