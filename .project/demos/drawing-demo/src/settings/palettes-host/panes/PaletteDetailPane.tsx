import { useEffect, useRef, useState } from 'react';
import {
  appendSketchSlot,
  clearSketchSlot,
  patchSketchBrush,
  renameSketchPalette,
  resetSketchPaletteToDefault,
} from '../../../authoring/nodes/sketchPalette';
import type { NodeId } from '../../../authoring/ids';
import type { AuthoringWorkspace } from '../../../authoring/workspace';
import { SETTINGS_CONTROL_INPUT_CLASS } from '../../controls/ControlRenderer';
import { BrushListEditor, type DocumentPalette } from '../../palette';
import { countFilledInDocument, filledBrushes } from '../../palette/sharedSlots';
import { SettingsDestructiveTextButton } from '../../shell/SettingsDestructiveTextButton';

type PaletteDetailPaneProps = {
  workspace: AuthoringWorkspace;
  sketchId: NodeId;
  palette: DocumentPalette;
  canRemove: boolean;
  onRemove: () => void;
};

export function PaletteDetailPane({
  workspace,
  sketchId,
  palette,
  canRemove,
  onRemove,
}: PaletteDetailPaneProps) {
  const documentStore = workspace.documentStore;
  const [nameDraft, setNameDraft] = useState(palette.name);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameDraft(palette.name);
  }, [palette.id, palette.name]);

  const commitName = () => {
    const next = nameDraft.trim();
    if (next && next !== palette.name) {
      renameSketchPalette(documentStore, sketchId, palette.id, next);
    } else {
      setNameDraft(palette.name);
    }
  };

  const sketch = documentStore.getState().nodes[sketchId];
  const setPalettes =
    sketch?.type === 'sketch' ? (sketch.palettes ?? []) : [palette];

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
              setNameDraft(palette.name);
              event.currentTarget.blur();
            }
          }}
          className={`${SETTINGS_CONTROL_INPUT_CLASS} w-full font-medium`}
          aria-label="Palette name"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              resetSketchPaletteToDefault(documentStore, sketchId, palette.id)
            }
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-[#519aba] transition-colors hover:border-gray-400"
          >
            Revert to default
          </button>
        </div>
      </div>

      <BrushListEditor
        brushes={filledBrushes(palette.brushes)}
        canRemoveBrush={countFilledInDocument(setPalettes) > 1}
        onPatchBrush={(id, partial) =>
          patchSketchBrush(documentStore, sketchId, palette.id, id, partial)
        }
        onAddBrush={() =>
          appendSketchSlot(documentStore, sketchId, palette.id) ?? ''
        }
        onRemoveBrush={(id) => {
          clearSketchSlot(documentStore, sketchId, palette.id, id);
        }}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      />

      <footer className="shrink-0 border-t border-gray-200 bg-white px-3 py-2">
        <SettingsDestructiveTextButton disabled={!canRemove} onClick={onRemove}>
          Remove Palette
        </SettingsDestructiveTextButton>
      </footer>
    </div>
  );
}
