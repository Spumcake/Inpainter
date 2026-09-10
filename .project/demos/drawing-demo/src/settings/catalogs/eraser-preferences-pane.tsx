import {
  EraserTipListEditor,
  defaultEraserStore,
  useDefaultEraserTips,
} from '../eraser';

/** Preferences → Eraser: edits the default/template eraser tip list. */
export function EraserPreferencesPane() {
  const tips = useDefaultEraserTips();

  return (
    <EraserTipListEditor
      tips={tips}
      onPatchTip={(id, partial) => defaultEraserStore.patchTip(id, partial)}
      onAddTip={() => defaultEraserStore.addTip()}
      onRemoveTip={(id) => {
        defaultEraserStore.removeTip(id);
      }}
    />
  );
}
