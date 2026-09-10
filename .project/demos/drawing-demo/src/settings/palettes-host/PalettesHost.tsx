import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  appendPaintStagingSlot,
  patchPaintStagingBrush,
  setPaintStaging,
} from '../../authoring/session';
import {
  addPaletteToSketch,
  removePaletteFromSketch,
} from '../../authoring/nodes/sketchPalette';
import type { AuthoringWorkspace } from '../../authoring/workspace';
import { SETTINGS_CONTROL_INPUT_CLASS } from '../controls/ControlRenderer';
import { SettingsShell } from '../shell/SettingsShell';
import {
  BrushListEditor,
  resolveActiveSketchForPalettes,
  resolveSketchPaletteId,
  type DocumentPalette,
} from '../palette';
import { cloneBrushesWithNewIds, clonePaletteSlots } from '../palette/cloneBrushes';
import { defaultPaletteStore } from '../palette/defaultPaletteStore';
import { filledBrushes } from '../palette/sharedSlots';
import {
  createStagingBrush,
  ensurePaintStaging,
  isPaletteStagingMode,
} from '../configDomain';
import { SettingsDestructiveTextButton } from '../shell/SettingsDestructiveTextButton';
import { PalettesNav } from './PalettesNav';
import { PaletteDetailPane } from './panes/PaletteDetailPane';

const STAGING_PALETTE_ID = '__paint-staging__';

type PalettesHostProps = {
  workspace: AuthoringWorkspace;
  onClose: () => void;
};

function firstFilledId(
  slots: Array<{ id: string } | null>,
): string | null {
  for (const slot of slots) {
    if (slot) return slot.id;
  }
  return null;
}

function StagingPaletteDetailPane({
  workspace,
  palette,
}: {
  workspace: AuthoringWorkspace;
  palette: DocumentPalette;
}) {
  const sessionStore = workspace.sessionStore;
  const filled = filledBrushes(palette.brushes);
  const [nameDraft, setNameDraft] = useState(palette.name);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameDraft(palette.name);
  }, [palette.id, palette.name]);

  const commitName = () => {
    const next = nameDraft.trim();
    const staging = sessionStore.getState().paintStaging;
    if (!staging) {
      setNameDraft(palette.name);
      return;
    }
    if (next && next !== staging.name) {
      setPaintStaging(sessionStore, { ...staging, name: next });
    } else {
      setNameDraft(staging.name);
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
            onClick={() => {
              const staging = sessionStore.getState().paintStaging;
              const brushes = clonePaletteSlots(
                cloneBrushesWithNewIds(defaultPaletteStore.getBrushes()),
              );
              setPaintStaging(sessionStore, {
                name: staging?.name ?? 'Palette 1',
                brushes,
                activeBrushId: firstFilledId(brushes),
              });
            }}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-[#519aba] transition-colors hover:border-gray-400"
          >
            Revert to default
          </button>
        </div>
      </div>

      <BrushListEditor
        brushes={filled}
        canRemoveBrush={filled.length > 1}
        onPatchBrush={(id, partial) =>
          patchPaintStagingBrush(sessionStore, id, partial)
        }
        onAddBrush={() => {
          ensurePaintStaging(sessionStore);
          const brush = createStagingBrush(filled.length + 1);
          appendPaintStagingSlot(sessionStore, brush);
          return brush.id;
        }}
        onRemoveBrush={(id) => {
          const staging = sessionStore.getState().paintStaging;
          if (!staging) return;
          const brushes = staging.brushes.map((slot) =>
            slot?.id === id ? null : slot,
          );
          const nextFilled = brushes.filter(
            (slot): slot is NonNullable<typeof slot> => slot != null,
          );
          if (nextFilled.length === 0) return;
          setPaintStaging(sessionStore, {
            name: staging.name,
            brushes,
            activeBrushId:
              staging.activeBrushId === id
                ? nextFilled[0]!.id
                : staging.activeBrushId,
          });
        }}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      />

      <footer className="shrink-0 border-t border-gray-200 bg-white px-3 py-2">
        <SettingsDestructiveTextButton disabled onClick={() => {}}>
          Remove Palette
        </SettingsDestructiveTextButton>
      </footer>
    </div>
  );
}

export function PalettesHost({ workspace, onClose }: PalettesHostProps) {
  useSyncExternalStore(
    (onStoreChange) => workspace.sessionStore.subscribe(onStoreChange),
    () => workspace.sessionStore.getState(),
    () => workspace.sessionStore.getState(),
  );
  useSyncExternalStore(
    (onStoreChange) => workspace.documentStore.subscribe(onStoreChange),
    () => workspace.documentStore.getState(),
    () => workspace.documentStore.getState(),
  );

  const sketch = resolveActiveSketchForPalettes(workspace);
  const nodes = workspace.documentStore.getState().nodes;
  const stagingMode = isPaletteStagingMode(
    workspace.sessionStore.getState(),
    nodes,
  );
  const useStaging = sketch == null || stagingMode;

  if (useStaging) {
    ensurePaintStaging(workspace.sessionStore);
  }

  const paintStaging = workspace.sessionStore.getState().paintStaging;
  const stagingPalettes: DocumentPalette[] = useStaging
    ? [
        {
          id: STAGING_PALETTE_ID,
          name: paintStaging?.name ?? 'Palette 1',
          brushes: paintStaging?.brushes ?? [],
        },
      ]
    : [];

  const palettes = useStaging ? stagingPalettes : (sketch?.palettes ?? []);
  const preferredId = useStaging
    ? STAGING_PALETTE_ID
    : resolveSketchPaletteId(workspace);

  const [activeId, setActiveId] = useState<string | null>(
    () => preferredId ?? palettes[0]?.id ?? null,
  );

  useEffect(() => {
    if (palettes.length === 0) {
      setActiveId(null);
      return;
    }
    if (activeId && palettes.some((palette) => palette.id === activeId)) {
      return;
    }
    if (preferredId && palettes.some((palette) => palette.id === preferredId)) {
      setActiveId(preferredId);
      return;
    }
    setActiveId(palettes[0]!.id);
  }, [palettes, activeId, preferredId]);

  const handleNew = useCallback(() => {
    if (useStaging) {
      ensurePaintStaging(workspace.sessionStore);
      const staging = workspace.sessionStore.getState().paintStaging!;
      const filled = staging.brushes.filter((slot) => slot != null).length;
      const brush = createStagingBrush(filled + 1);
      appendPaintStagingSlot(workspace.sessionStore, brush);
      setActiveId(STAGING_PALETTE_ID);
      return;
    }
    if (!sketch) return;
    const id = addPaletteToSketch(workspace.documentStore, sketch.id);
    if (id) setActiveId(id);
  }, [sketch, useStaging, workspace.documentStore, workspace.sessionStore]);

  const handleRemove = useCallback(
    (id: string) => {
      if (useStaging || !sketch) return;
      const removed = removePaletteFromSketch(
        workspace.documentStore,
        sketch.id,
        id,
      );
      if (!removed) return;
      const remaining =
        (
          workspace.documentStore.getState().nodes[sketch.id] as
            | { palettes?: { id: string }[] }
            | undefined
        )?.palettes ?? [];
      setActiveId(remaining[0]?.id ?? null);
    },
    [sketch, useStaging, workspace.documentStore],
  );

  const activePalette =
    palettes.find((palette) => palette.id === activeId) ?? null;

  return (
    <SettingsShell
      title="Palettes"
      onClose={onClose}
      defaultHeight={328}
      nav={
        <PalettesNav
          palettes={palettes}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={handleNew}
          canCreate={useStaging || sketch != null}
        />
      }
    >
      {useStaging && activePalette ? (
        <StagingPaletteDetailPane
          workspace={workspace}
          palette={activePalette}
        />
      ) : sketch && activePalette ? (
        <PaletteDetailPane
          workspace={workspace}
          sketchId={sketch.id}
          palette={activePalette}
          canRemove={palettes.length > 1}
          onRemove={() => handleRemove(activePalette.id)}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-3 text-xs text-gray-400">
          No palettes yet.
        </div>
      )}
    </SettingsShell>
  );
}
