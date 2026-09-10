import { useEffect, useRef, useState } from 'react';

export const INLINE_RENAME_INPUT_CLASS =
  'max-w-[200px] rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs font-medium text-gray-800 outline-none focus:border-gray-400';

type InlineRenameLabelProps = {
  value: string;
  live: boolean;
  title?: string;
  className?: string;
  inputClassName?: string;
  activateOn?: 'click' | 'doubleClick';
  onCommit: (next: string) => void;
};

export function InlineRenameLabel({
  value,
  live,
  title = 'Rename',
  className = 'cursor-text rounded px-1 transition-colors hover:bg-gray-100 hover:text-gray-600',
  inputClassName = INLINE_RENAME_INPUT_CLASS,
  activateOn = 'click',
  onCommit,
}: InlineRenameLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setEditing(false);
  }, [value]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) {
      onCommit(next);
    }
    setEditing(false);
  };

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  if (!live) {
    return <span className={className}>{value}</span>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setEditing(false);
          }
        }}
        className={inputClassName}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      />
    );
  }

  if (activateOn === 'doubleClick') {
    return (
      <span
        className={className}
        title={title}
        onDoubleClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          startEditing();
        }}
      >
        {value}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        startEditing();
      }}
    >
      {value}
    </button>
  );
}
