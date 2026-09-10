import { GlobalPanel } from './GlobalPanel';
import { JsonEditorView } from './json-editor';
import stubPromptCompiler from './json-editor/stub-prompt-compiler.json';
import type { JsonEditorValue } from './json-editor';

type PromptCompilerPanelProps = {
  onClose: () => void;
};

export function PromptCompilerPanel({ onClose }: PromptCompilerPanelProps) {
  return (
    <GlobalPanel
      ariaLabel="Prompt Compiler Settings"
      size="wide"
      widthPx={570}
      heightPx={330}
      scrollAccent
      onClose={onClose}
    >
      <JsonEditorView data={stubPromptCompiler as JsonEditorValue} />
    </GlobalPanel>
  );
}
