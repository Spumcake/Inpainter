import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Plus,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  setActiveBrushId,
  setActiveEraserId,
  setActivePaletteId,
  setActiveTool,
  appendPaintStagingSlot,
  fillPaintStagingSlot,
  patchPaintStagingBrush,
  reorderPaintStagingSlots,
  setPaintStagingActiveBrushId,
} from '../authoring/session';
import {
  appendSketchSlot,
  canReorderSurfaceStack,
  fillSketchSlot,
  listCanvasSurfaceStack,
  listGraphSurfaceStack,
  patchSketchBrush,
  reorderSketchSlots,
  reorderSurfaceStack,
  setSketchActivePaletteId,
} from '../authoring/nodes';
import type { AuthoringWorkspace } from '../authoring/workspace';
import type { ActiveTool } from '../authoring/types/session';
import type { NodeRef } from '../authoring/types';
import { clampStrokeOpacity } from '../canvas/strokeOpacity';
import { clampSessionActiveEraserId } from '../settings/activeEraserSession';
import { clampSessionActivePaletteId } from '../settings/activePaletteSession';
import {
  documentEraserStore,
  eraserSizeField,
  useDocumentEraserTips,
  type EraserTip,
} from '../settings/eraser';
import {
  resolveActiveSketchForPalettes,
  type Brush,
  type DocumentPalette,
} from '../settings/palette';
import {
  createStagingBrush,
  ensurePaintStaging,
  isPaletteStagingMode,
} from '../settings/configDomain';
import {
  PresetStripShell,
  PresetStripStack,
  useHorizontalSlotDrag,
} from './preset-strips';

function toColorInputValue(raw: string): string {
  const value = raw.trim();
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!match) return '#000000';
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

type ToolConfigModalProps = {
  workspace: AuthoringWorkspace;
  onClose: () => void;
  onOpenPaletteLibrary: () => void;
  onOpenEraserLibrary: () => void;
  onOpenOutliner: () => void;
};

function subscribeSession(
  workspace: AuthoringWorkspace,
  onStoreChange: () => void,
): () => void {
  return workspace.sessionStore.subscribe(onStoreChange);
}

function getActiveTool(workspace: AuthoringWorkspace): ActiveTool {
  return workspace.sessionStore.getState().activeTool;
}

function getActivePaletteId(workspace: AuthoringWorkspace): string | null {
  return workspace.sessionStore.getState().activePaletteId;
}

function getActiveBrushId(workspace: AuthoringWorkspace): string | null {
  return workspace.sessionStore.getState().activeBrushId;
}

function getActiveEraserId(workspace: AuthoringWorkspace): string | null {
  return workspace.sessionStore.getState().activeEraserId;
}

function slotDragId(slot: Brush | null, index: number): string {
  return slot ? slot.id : `empty-${index}`;
}

function PaletteBrushStrip({
  palette,
  active,
  selectedBrushId,
  onActivatePalette,
  onSelectBrush,
  onFillSlot,
  onAppendSlot,
  dragId,
  onSlotPointerDown,
  shiftForIndex,
  getSlotAt,
}: {
  palette: DocumentPalette;
  active: boolean;
  selectedBrushId: string | null;
  onActivatePalette: (brushId?: string) => void;
  onSelectBrush: (brushId: string) => void;
  onFillSlot: (paletteId: string, index: number) => void;
  onAppendSlot: (paletteId: string) => void;
  dragId: string | null;
  onSlotPointerDown: (dragKey: string, index: number, clientX: number) => void;
  shiftForIndex: (index: number) => number;
  /** Override slot lookup (staging); defaults to document catalog. */
  getSlotAt?: (index: number) => Brush | null;
}) {
  return (
    <PresetStripShell
      active={active}
      title={palette.name}
      activeAriaLabel="Brush palette"
      onActivate={() => onActivatePalette()}
    >
      {palette.brushes.map((slot, index) => {
        const dragKey = slotDragId(slot, index);
        const shift = active ? shiftForIndex(index) : 0;
        const dragging = active && dragKey === dragId;

        if (!slot) {
          return (
            <button
              key={`empty-${palette.id}-${index}`}
              type="button"
              title="Empty slot — click to add brush"
              className={`flex shrink-0 items-center justify-center rounded-full border border-dashed ${
                active ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
              } ${dragging ? 'h-[25px] w-[25px]' : 'h-5 w-5'}`}
              style={{
                borderColor: 'rgb(180 181 184)',
                color: 'rgb(180 181 184)',
                transform: shift ? `translateX(${shift}px)` : undefined,
                transition:
                  dragging || dragId == null
                    ? 'none'
                    : 'transform 160ms ease, width 120ms ease, height 120ms ease',
                zIndex: dragging ? 2 : 0,
                touchAction: 'none',
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                if (!active) {
                  onActivatePalette();
                  return;
                }
                onSlotPointerDown(dragKey, index, event.clientX);
              }}
              onClick={(event) => {
                event.stopPropagation();
                // Skip fill if this slot was filled by a concurrent update, or after a drag reorder.
                const current = getSlotAt
                  ? getSlotAt(index)
                  : palette.brushes[index];
                if (current != null) return;
                if (!active) {
                  onActivatePalette();
                }
                onFillSlot(palette.id, index);
              }}
            />
          );
        }

        const selected = active && slot.id === selectedBrushId;
        const emphasized = active ? (dragId ? dragging : selected) : false;
        return (
          <button
            key={slot.id}
            type="button"
            title={slot.name}
            aria-pressed={selected}
            className={`shrink-0 rounded-full border border-transparent ${
              active ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
            } ${emphasized ? 'h-[25px] w-[25px]' : 'h-5 w-5'}`}
            style={{
              backgroundColor: slot.color,
              opacity: clampStrokeOpacity(slot.opacity),
              transform: shift ? `translateX(${shift}px)` : undefined,
              transition:
                dragging || dragId == null
                  ? 'none'
                  : 'transform 160ms ease, width 120ms ease, height 120ms ease',
              zIndex: dragging ? 2 : emphasized ? 1 : 0,
              touchAction: 'none',
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              if (!active) {
                onActivatePalette(slot.id);
                return;
              }
              onSelectBrush(slot.id);
              onSlotPointerDown(dragKey, index, event.clientX);
            }}
          />
        );
      })}
      <button
        type="button"
        title="Add slot"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed transition-colors"
        style={{ borderColor: 'rgb(120 121 124)', color: 'rgb(120 121 124)' }}
        onClick={(event) => {
          event.stopPropagation();
          onAppendSlot(palette.id);
        }}
      >
        <Plus size={12} />
      </button>
    </PresetStripShell>
  );
}

function ToolConfigPaintStagingBody({
  workspace,
  onOpenPaletteLibrary,
}: {
  workspace: AuthoringWorkspace;
  onOpenPaletteLibrary: () => void;
}) {
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const pendingColorBrushRef = useRef<string | null>(null);
  const paintStaging = useSyncExternalStore(
    (onStoreChange) => subscribeSession(workspace, onStoreChange),
    () => {
      ensurePaintStaging(workspace.sessionStore);
      return workspace.sessionStore.getState().paintStaging;
    },
    () => {
      ensurePaintStaging(workspace.sessionStore);
      return workspace.sessionStore.getState().paintStaging;
    },
  );

  const stagingPalette: DocumentPalette = {
    id: '__paint-staging__',
    name: 'New Sketch',
    brushes: paintStaging?.brushes ?? [],
  };
  const slotCount = stagingPalette.brushes.length;
  const selectedBrushId = paintStaging?.activeBrushId ?? null;

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      reorderPaintStagingSlots(workspace.sessionStore, fromIndex, toIndex);
    },
    [workspace.sessionStore],
  );

  const { dragId, beginDrag, shiftForIndex } = useHorizontalSlotDrag({
    itemCount: slotCount,
    onReorder: handleReorder,
  });

  const originIndex = dragId
    ? (stagingPalette.brushes.findIndex((slot, index) =>
        slot ? slot.id === dragId : dragId === `empty-${index}`,
      ) ?? -1)
    : -1;

  const openColorPickerForBrush = (brush: Brush) => {
    const input = colorInputRef.current;
    if (!input) return;
    pendingColorBrushRef.current = brush.id;
    input.value = toColorInputValue(brush.color);
    requestAnimationFrame(() => {
      try {
        input.showPicker();
      } catch {
        input.click();
      }
    });
  };

  const handleSelectBrush = (brushId: string) => {
    setPaintStagingActiveBrushId(workspace.sessionStore, brushId);
    setActiveTool(workspace.sessionStore, 'paint');
  };

  const handleAppendSlot = () => {
    const filled = stagingPalette.brushes.filter((s) => s != null).length;
    const brush = createStagingBrush(filled + 1);
    appendPaintStagingSlot(workspace.sessionStore, brush);
    openColorPickerForBrush(brush);
    setActiveTool(workspace.sessionStore, 'paint');
  };

  const handleFillSlot = (_paletteId: string, index: number) => {
    const filled = stagingPalette.brushes.filter((s) => s != null).length;
    const brush = createStagingBrush(filled + 1);
    fillPaintStagingSlot(workspace.sessionStore, index, brush);
    openColorPickerForBrush(brush);
    setActiveTool(workspace.sessionStore, 'paint');
  };

  return (
    <>
      <input
        ref={colorInputRef}
        type="color"
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onChange={(event) => {
          const brushId = pendingColorBrushRef.current;
          if (!brushId) return;
          patchPaintStagingBrush(workspace.sessionStore, brushId, {
            color: event.target.value,
          });
        }}
        onBlur={() => {
          pendingColorBrushRef.current = null;
        }}
      />
      <PresetStripStack onMore={onOpenPaletteLibrary}>
        <PaletteBrushStrip
          palette={stagingPalette}
          active
          selectedBrushId={selectedBrushId}
          onActivatePalette={(brushId) => {
            if (brushId) handleSelectBrush(brushId);
            else setActiveTool(workspace.sessionStore, 'paint');
          }}
          onSelectBrush={handleSelectBrush}
          onFillSlot={handleFillSlot}
          onAppendSlot={handleAppendSlot}
          dragId={dragId}
          onSlotPointerDown={(dragKey, index, clientX) => {
            beginDrag(dragKey, index, clientX);
          }}
          shiftForIndex={(index) =>
            originIndex < 0 ? 0 : shiftForIndex(index, originIndex)
          }
          getSlotAt={(index) =>
            workspace.sessionStore.getState().paintStaging?.brushes[index] ??
            null
          }
        />
      </PresetStripStack>
    </>
  );
}

function ToolConfigPaintCatalogBody({
  workspace,
  onOpenPaletteLibrary,
}: {
  workspace: AuthoringWorkspace;
  onOpenPaletteLibrary: () => void;
}) {
  useSyncExternalStore(
    (onStoreChange) => workspace.documentStore.subscribe(onStoreChange),
    () => workspace.documentStore.getState(),
    () => workspace.documentStore.getState(),
  );
  const sketch = resolveActiveSketchForPalettes(workspace);
  const sketchId = sketch?.id ?? null;
  const palettes = sketch?.palettes ?? [];
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const pendingColorBrushRef = useRef<{
    paletteId: string;
    brushId: string;
  } | null>(null);
  const activePaletteId = useSyncExternalStore(
    (onStoreChange) => subscribeSession(workspace, onStoreChange),
    () => getActivePaletteId(workspace),
    () => getActivePaletteId(workspace),
  );
  const selectedBrushId = useSyncExternalStore(
    (onStoreChange) => subscribeSession(workspace, onStoreChange),
    () => getActiveBrushId(workspace),
    () => getActiveBrushId(workspace),
  );

  const activePalette = palettes.find((palette) => palette.id === activePaletteId);
  const slotCount = activePalette?.brushes.length ?? 0;

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!sketchId) return;
      reorderSketchSlots(workspace.documentStore, sketchId, fromIndex, toIndex);
    },
    [sketchId, workspace.documentStore],
  );

  const { dragId, beginDrag, shiftForIndex } = useHorizontalSlotDrag({
    itemCount: slotCount,
    onReorder: handleReorder,
  });

  useEffect(() => {
    clampSessionActivePaletteId(workspace);
  }, [workspace, palettes, activePaletteId]);

  const originIndex = dragId
    ? (activePalette?.brushes.findIndex((slot, index) =>
        slot ? slot.id === dragId : dragId === `empty-${index}`,
      ) ?? -1)
    : -1;

  const openColorPickerForBrush = (paletteId: string, brushId: string) => {
    const palette = palettes.find((entry) => entry.id === paletteId);
    const brush = palette?.brushes.find((slot) => slot?.id === brushId);
    const input = colorInputRef.current;
    if (!brush || !input) return;
    pendingColorBrushRef.current = { paletteId, brushId };
    input.value = toColorInputValue(brush.color);
    // Native picker must open from a user gesture; rAF keeps this in the click turn.
    requestAnimationFrame(() => {
      try {
        input.showPicker();
      } catch {
        input.click();
      }
    });
  };

  const handleActivatePalette = (paletteId: string, brushId?: string) => {
    if (sketchId) {
      setSketchActivePaletteId(workspace.documentStore, sketchId, paletteId);
    }
    setActivePaletteId(workspace.sessionStore, paletteId);
    if (brushId) {
      setActiveBrushId(workspace.sessionStore, brushId);
    }
    clampSessionActivePaletteId(workspace);
    setActiveTool(workspace.sessionStore, 'paint');
  };

  const handleSelectBrush = (brushId: string) => {
    setActiveBrushId(workspace.sessionStore, brushId);
    setActiveTool(workspace.sessionStore, 'paint');
  };

  const handleAppendSlot = (paletteId: string) => {
    if (!sketchId) return;
    setSketchActivePaletteId(workspace.documentStore, sketchId, paletteId);
    setActivePaletteId(workspace.sessionStore, paletteId);
    const newId = appendSketchSlot(workspace.documentStore, sketchId, paletteId);
    if (newId) {
      setActiveBrushId(workspace.sessionStore, newId);
      openColorPickerForBrush(paletteId, newId);
    }
    clampSessionActivePaletteId(workspace);
    setActiveTool(workspace.sessionStore, 'paint');
  };

  const handleFillSlot = (paletteId: string, index: number) => {
    if (!sketchId) return;
    setSketchActivePaletteId(workspace.documentStore, sketchId, paletteId);
    setActivePaletteId(workspace.sessionStore, paletteId);
    const newId = fillSketchSlot(
      workspace.documentStore,
      sketchId,
      paletteId,
      index,
    );
    if (newId) {
      setActiveBrushId(workspace.sessionStore, newId);
      openColorPickerForBrush(paletteId, newId);
    }
    clampSessionActivePaletteId(workspace);
    setActiveTool(workspace.sessionStore, 'paint');
  };

  const handleSlotPointerDown = (dragKey: string, index: number, clientX: number) => {
    beginDrag(dragKey, index, clientX);
  };

  const activeShiftForIndex = (index: number) => {
    if (!activePaletteId || originIndex < 0) return 0;
    return shiftForIndex(index, originIndex);
  };

  return (
    <>
      <input
        ref={colorInputRef}
        type="color"
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onChange={(event) => {
          const pending = pendingColorBrushRef.current;
          if (!pending || !sketchId) return;
          patchSketchBrush(
            workspace.documentStore,
            sketchId,
            pending.paletteId,
            pending.brushId,
            { color: event.target.value },
          );
        }}
        onBlur={() => {
          pendingColorBrushRef.current = null;
        }}
      />
      <PresetStripStack onMore={onOpenPaletteLibrary}>
        {palettes
          .filter((palette) =>
            activePaletteId ? palette.id === activePaletteId : true,
          )
          .map((palette) => {
          const active = palette.id === activePaletteId;
          return (
            <PaletteBrushStrip
              key={palette.id}
              palette={palette}
              active={active}
              selectedBrushId={selectedBrushId}
              onActivatePalette={(brushId) =>
                handleActivatePalette(palette.id, brushId)
              }
              onSelectBrush={handleSelectBrush}
              onFillSlot={handleFillSlot}
              onAppendSlot={handleAppendSlot}
              dragId={active ? dragId : null}
              onSlotPointerDown={handleSlotPointerDown}
              shiftForIndex={active ? activeShiftForIndex : () => 0}
            />
          );
        })}
      </PresetStripStack>
    </>
  );
}

function ToolConfigPaintBody({
  workspace,
  onOpenPaletteLibrary,
}: {
  workspace: AuthoringWorkspace;
  onOpenPaletteLibrary: () => void;
}) {
  const stagingMode = useSyncExternalStore(
    (onStoreChange) => {
      const unsubSession = subscribeSession(workspace, onStoreChange);
      const unsubDocument = workspace.documentStore.subscribe(onStoreChange);
      return () => {
        unsubSession();
        unsubDocument();
      };
    },
    () =>
      isPaletteStagingMode(
        workspace.sessionStore.getState(),
        workspace.documentStore.getState().nodes,
      ),
    () =>
      isPaletteStagingMode(
        workspace.sessionStore.getState(),
        workspace.documentStore.getState().nodes,
      ),
  );

  const catalogSketch = resolveActiveSketchForPalettes(workspace);
  const useStaging =
    stagingMode ||
    catalogSketch == null ||
    (catalogSketch.palettes?.length ?? 0) === 0;

  if (useStaging) {
    return (
      <ToolConfigPaintStagingBody
        workspace={workspace}
        onOpenPaletteLibrary={onOpenPaletteLibrary}
      />
    );
  }

  return (
    <ToolConfigPaintCatalogBody
      workspace={workspace}
      onOpenPaletteLibrary={onOpenPaletteLibrary}
    />
  );
}

function EraserTipStrip({
  tip,
  active,
  onSelect,
  onPatchSize,
}: {
  tip: EraserTip;
  active: boolean;
  onSelect: () => void;
  onPatchSize: (size: number) => void;
}) {
  return (
    <PresetStripShell
      active={active}
      title={tip.name}
      activeAriaLabel="Eraser tip"
      onActivate={onSelect}
    >
      <div
        className="-mx-[5px] flex h-full items-center py-0"
        style={{ padding: '0 12px' }}
        onClick={(event) => {
          event.stopPropagation();
          if (!active) onSelect();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <input
          type="range"
          min={eraserSizeField.min ?? 1}
          max={eraserSizeField.max ?? 256}
          step={eraserSizeField.step ?? 1}
          value={tip.size}
          aria-label={`${tip.name} size`}
          className="accent-gray-900"
          onChange={(event) => {
            const size = Number(event.target.value);
            if (!active) onSelect();
            onPatchSize(size);
          }}
        />
        <span className="w-8 text-center text-xs tabular-nums text-gray-600">
          {tip.size}
        </span>
      </div>
    </PresetStripShell>
  );
}

function ToolConfigEraseBody({
  workspace,
  onOpenEraserLibrary,
}: {
  workspace: AuthoringWorkspace;
  onOpenEraserLibrary: () => void;
}) {
  const tips = useDocumentEraserTips();
  const selectedTipId = useSyncExternalStore(
    (onStoreChange) => subscribeSession(workspace, onStoreChange),
    () => getActiveEraserId(workspace),
    () => getActiveEraserId(workspace),
  );

  useEffect(() => {
    clampSessionActiveEraserId(workspace.sessionStore);
  }, [workspace.sessionStore, tips]);

  const latchErase = () => {
    setActiveTool(workspace.sessionStore, 'erase');
  };

  const handleSelectTip = (tipId: string) => {
    setActiveEraserId(workspace.sessionStore, tipId);
    latchErase();
  };

  const handlePatchSize = (tipId: string, size: number) => {
    documentEraserStore.patchTip(tipId, { size });
  };

  return (
    <PresetStripStack onMore={onOpenEraserLibrary}>
      {tips.map((tip) => {
        const active = tip.id === selectedTipId;
        return (
          <EraserTipStrip
            key={tip.id}
            tip={tip}
            active={active}
            onSelect={() => handleSelectTip(tip.id)}
            onPatchSize={(size) => handlePatchSize(tip.id, size)}
          />
        );
      })}
    </PresetStripStack>
  );
}

function ToolConfigSelectBody({
  workspace,
}: {
  workspace: AuthoringWorkspace;
}) {
  // Return the Session Set directly — never allocate in getSnapshot (infinite re-render).
  const selection = useSyncExternalStore(
    (onStoreChange) => subscribeSession(workspace, onStoreChange),
    () => workspace.sessionStore.getState().selection,
    () => workspace.sessionStore.getState().selection,
  );
  const documentState = useSyncExternalStore(
    (onStoreChange) => workspace.documentStore.subscribe(onStoreChange),
    () => workspace.documentStore.getState(),
    () => workspace.documentStore.getState(),
  );

  const { graphId, canvasId } = workspace.sessionStore.getState().viewFocus;

  let selectedStackable: NodeRef | null = null;
  if (selection.size === 1) {
    const only = selection.values().next().value as NodeRef | undefined;
    if (!only) {
      selectedStackable = null;
    } else if (canvasId && (only.type === 'sketch' || only.type === 'image')) {
      selectedStackable = only;
    } else if (
      !canvasId &&
      graphId &&
      (only.type === 'frame' || only.type === 'image')
    ) {
      selectedStackable = only;
    }
  }

  const selectedNode =
    selectedStackable != null
      ? documentState.nodes[selectedStackable.id]
      : undefined;

  const surfaceStack =
    selectedNode == null
      ? []
      : canvasId
        ? listCanvasSurfaceStack(documentState, canvasId)
        : graphId
          ? listGraphSurfaceStack(documentState, graphId)
          : [];

  // Canvas Images only; Graph Images only — reject wrong-surface selection.
  const stackableOnSurface =
    selectedStackable != null &&
    selectedNode != null &&
    surfaceStack.some((node) => node.id === selectedStackable.id);

  const actions = [
    { id: 'front' as const, label: 'Bring to front', Icon: ArrowUpToLine },
    { id: 'forward' as const, label: 'Bring forward', Icon: ArrowUp },
    { id: 'backward' as const, label: 'Send backward', Icon: ArrowDown },
    { id: 'back' as const, label: 'Send to back', Icon: ArrowDownToLine },
  ];

  return (
    <section
      className="flex h-[35px] w-auto items-center overflow-hidden rounded-full border border-gray-200 bg-white"
      role="dialog"
      aria-modal
      aria-label="Sort selection"
      title="Sort"
    >
      <div className="flex h-full items-center gap-[5px] px-[5px] py-0">
        {actions.map(({ id, label, Icon }) => {
          const enabled =
            stackableOnSurface &&
            selectedStackable != null &&
            canReorderSurfaceStack(surfaceStack, selectedStackable.id, id);
          return (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              disabled={!enabled}
              className={`flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-full transition-none ${
                enabled
                  ? 'text-gray-700 hover:bg-gray-100'
                  : 'cursor-not-allowed text-gray-400'
              }`}
              onClick={() => {
                if (!selectedStackable || !enabled) return;
                workspace.runner.dispatch(
                  reorderSurfaceStack(selectedStackable.id, id, graphId),
                );
              }}
            >
              <Icon size={15} strokeWidth={2} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ToolConfigModal({
  workspace,
  onClose,
  onOpenPaletteLibrary,
  onOpenEraserLibrary,
  onOpenOutliner,
}: ToolConfigModalProps) {
  const activeTool = useSyncExternalStore(
    (onStoreChange) => subscribeSession(workspace, onStoreChange),
    () => getActiveTool(workspace),
    () => getActiveTool(workspace),
  );

  const handleOpenLibrary =
    activeTool === 'erase' ? onOpenEraserLibrary : onOpenPaletteLibrary;

  return (
    <div
      className="absolute inset-0 z-[60] flex items-start justify-center bg-chrome-scrim pt-12"
      onMouseDown={onClose}
    >
      <div onMouseDown={(event) => event.stopPropagation()}>
        {activeTool === 'select' ? (
          <PresetStripStack onMore={onOpenOutliner} moreTitle="Outliner">
            <ToolConfigSelectBody workspace={workspace} />
          </PresetStripStack>
        ) : activeTool === 'erase' ? (
          <ToolConfigEraseBody
            workspace={workspace}
            onOpenEraserLibrary={handleOpenLibrary}
          />
        ) : (
          <ToolConfigPaintBody
            workspace={workspace}
            onOpenPaletteLibrary={handleOpenLibrary}
          />
        )}
      </div>
    </div>
  );
}
