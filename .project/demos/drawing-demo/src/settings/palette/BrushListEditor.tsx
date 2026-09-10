import { Blend, Circle, Pipette, Spline } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ControlRenderer, SETTINGS_CONTROL_INPUT_CLASS } from '../controls/ControlRenderer';
import { SettingsPaneScroll } from '../pane/SettingsPaneScroll';
import { SettingsDestructiveTextButton } from '../shell/SettingsDestructiveTextButton';
import {
  SettingsExpandableEntryHeader,
  SettingsExpandableEntryName,
} from '../shell/SettingsExpandableEntryHeader';
import { SettingsExpandableFields } from '../shell/SettingsExpandableFields';
import { SettingsRow } from '../shell/SettingsRow';
import { SettingsSection } from '../shell/SettingsSection';
import {
  brushOpacityField,
  brushSizeField,
  brushSmoothingField,
} from './brushFieldDefs';
import { BrushStrokePreview } from './brush-stroke-preview';
import type { Brush } from './types';

function normalizeHex(raw: string): string | null {
  const value = raw.trim();
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const hex = match[1];
  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((ch) => `${ch}${ch}`)
      .join('')
      .toLowerCase()}`;
  }
  return `#${hex.toLowerCase()}`;
}

function ColorControl({
  brush,
  onPatch,
}: {
  brush: Brush;
  onPatch: (partial: Partial<Omit<Brush, 'id'>>) => void;
}) {
  const [hexDraft, setHexDraft] = useState(brush.color);

  useEffect(() => {
    setHexDraft(brush.color);
  }, [brush.color]);

  const commitHex = (raw: string) => {
    const next = normalizeHex(raw);
    if (!next) {
      setHexDraft(brush.color);
      return;
    }
    setHexDraft(next);
    if (next !== brush.color) {
      onPatch({ color: next });
    }
  };

  return (
    <div className="flex items-center gap-3">
      <input
        type="text"
        value={hexDraft}
        spellCheck={false}
        onChange={(event) => setHexDraft(event.target.value)}
        onBlur={() => commitHex(hexDraft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        className={`${SETTINGS_CONTROL_INPUT_CLASS} w-28 font-mono uppercase`}
        aria-label={`${brush.name} hex color`}
      />
      <label
        className="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-md border border-gray-300"
        title="Pick color"
      >
        <span className="absolute inset-0" style={{ backgroundColor: brush.color }} />
        <input
          type="color"
          value={normalizeHex(brush.color) ?? '#000000'}
          onChange={(event) => {
            const next = event.target.value.toLowerCase();
            setHexDraft(next);
            onPatch({ color: next });
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`${brush.name} color picker`}
        />
      </label>
    </div>
  );
}

function BrushFields({
  brush,
  canRemove,
  onPatch,
  onRemove,
}: {
  brush: Brush;
  canRemove: boolean;
  onPatch: (partial: Partial<Omit<Brush, 'id'>>) => void;
  onRemove: () => void;
}) {
  return (
    <SettingsExpandableFields
      footer={
        <SettingsDestructiveTextButton disabled={!canRemove} onClick={onRemove}>
          Remove Brush
        </SettingsDestructiveTextButton>
      }
    >
      <SettingsRow
        label="Color"
        icon={<Pipette size={16} strokeWidth={2} aria-hidden />}
      >
        <ColorControl brush={brush} onPatch={onPatch} />
      </SettingsRow>
      <SettingsRow
        label={brushSizeField.label}
        icon={<Circle size={16} strokeWidth={2} aria-hidden />}
      >
        <ControlRenderer
          field={brushSizeField}
          value={brush.size}
          onChange={(value) =>
            onPatch({
              size: typeof value === 'number' ? value : Number(value),
            })
          }
        />
      </SettingsRow>
      <SettingsRow
        label={brushOpacityField.label}
        icon={<Blend size={16} strokeWidth={2} aria-hidden />}
      >
        <ControlRenderer
          field={brushOpacityField}
          value={brush.opacity}
          onChange={(value) =>
            onPatch({
              opacity: typeof value === 'number' ? value : Number(value),
            })
          }
        />
      </SettingsRow>
      <SettingsRow
        label={brushSmoothingField.label}
        icon={<Spline size={16} strokeWidth={2} aria-hidden />}
      >
        <ControlRenderer
          field={brushSmoothingField}
          value={brush.smoothing}
          onChange={(value) =>
            onPatch({
              smoothing: typeof value === 'number' ? value : Number(value),
            })
          }
        />
      </SettingsRow>
    </SettingsExpandableFields>
  );
}

export type BrushListEditorProps = {
  brushes: Brush[];
  onPatchBrush: (id: string, partial: Partial<Omit<Brush, 'id'>>) => void;
  onAddBrush: () => string;
  onRemoveBrush: (id: string) => void;
  /** Defaults to brushes.length > 1 (Preferences template). Document palettes pass document-wide filled count. */
  canRemoveBrush?: boolean;
  className?: string;
};

/** Props-driven expandable brush list editor (no store imports). */
export function BrushListEditor({
  brushes,
  onPatchBrush,
  onAddBrush,
  onRemoveBrush,
  canRemoveBrush: canRemoveBrushProp,
  className = 'flex min-h-0 flex-1 flex-col overflow-hidden',
}: BrushListEditorProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const canRemoveBrush = canRemoveBrushProp ?? brushes.length > 1;

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
                const id = onAddBrush();
                setExpandedIds((prev) => new Set(prev).add(id));
                setEditingNameId(id);
              }}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-[#519aba] transition-colors hover:border-gray-400"
            >
              Add Brush
            </button>
          }
        >
          {brushes.length === 0 ? (
            <p className="px-2 py-4 text-xs text-gray-400">No brushes yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {brushes.map((brush) => {
                const expanded = expandedIds.has(brush.id);
                const editingName = editingNameId === brush.id;
                return (
                  <li key={brush.id}>
                    <SettingsExpandableEntryHeader
                      expanded={expanded}
                      onToggle={() => toggleExpanded(brush.id)}
                      toggleAriaLabel={
                        expanded ? `Collapse ${brush.name}` : `Expand ${brush.name}`
                      }
                      label={
                        <SettingsExpandableEntryName
                          name={brush.name}
                          editing={editingName}
                          onStartEdit={() => setEditingNameId(brush.id)}
                          onEndEdit={() => setEditingNameId(null)}
                          onRename={(name) => onPatchBrush(brush.id, { name })}
                          ariaLabel="Brush name"
                        />
                      }
                      preview={
                        <BrushStrokePreview
                          color={brush.color}
                          size={brush.size}
                          opacity={brush.opacity}
                          className="h-full w-full"
                        />
                      }
                    />
                    {expanded ? (
                      <BrushFields
                        brush={brush}
                        canRemove={canRemoveBrush}
                        onPatch={(partial) => onPatchBrush(brush.id, partial)}
                        onRemove={() => {
                          onRemoveBrush(brush.id);
                          setExpandedIds((prev) => {
                            const next = new Set(prev);
                            next.delete(brush.id);
                            return next;
                          });
                          if (editingNameId === brush.id) {
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
