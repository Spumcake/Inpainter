import {
  BrushListEditor,
  defaultPaletteStore,
  useDefaultPaletteBrushes,
} from '../palette';

/** Preferences → Palette: edits the default/template brush list. */
export function PalettePreferencesPane() {
  const brushes = useDefaultPaletteBrushes();

  return (
    <BrushListEditor
      brushes={brushes}
      onPatchBrush={(id, partial) => defaultPaletteStore.patchBrush(id, partial)}
      onAddBrush={() => defaultPaletteStore.addBrush()}
      onRemoveBrush={(id) => {
        defaultPaletteStore.removeBrush(id);
      }}
    />
  );
}
