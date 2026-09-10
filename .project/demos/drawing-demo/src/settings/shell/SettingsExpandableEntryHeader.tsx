import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Collapsed expandable entity row — fixed 44px, never taller. */
export const SETTINGS_EXPANDABLE_ENTRY_HEADER_CLASS =
  'flex h-11 w-full items-center gap-2 px-2';

const nameDisplayClass =
  'flex h-7 min-w-0 flex-1 items-center truncate rounded-md px-2 text-left text-sm font-medium text-gray-900';

const nameEditClass =
  'box-border h-7 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm font-medium text-gray-900 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300';

/** Fixed-height preview gutter so stroke vs tip dots do not change row height. */
export const SETTINGS_EXPANDABLE_ENTRY_PREVIEW_SLOT_CLASS =
  'flex h-7 w-20 shrink-0 items-center justify-end';

type SettingsExpandableEntryNameProps = {
  name: string;
  editing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onRename: (name: string) => void;
  ariaLabel: string;
};

/** Inline rename that stays inside the 44px header (display and edit both h-7). */
export function SettingsExpandableEntryName({
  name,
  editing,
  onStartEdit,
  onEndEdit,
  onRename,
  ariaLabel,
}: SettingsExpandableEntryNameProps) {
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(name);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, name]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== name) {
      onRename(next);
    } else {
      setDraft(name);
    }
    onEndEdit();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(name);
            onEndEdit();
          }
        }}
        onClick={(event) => event.stopPropagation()}
        className={nameEditClass}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onStartEdit();
      }}
      className={`${nameDisplayClass} hover:bg-gray-100`}
      title="Click to rename"
    >
      {name}
    </button>
  );
}

type SettingsExpandableEntryHeaderProps = {
  expanded: boolean;
  onToggle: () => void;
  /** Left label (plain text node, or SettingsExpandableEntryName). */
  label: ReactNode;
  /** Optional domain preview (stroke, tip dot) — must fit in the fixed preview slot. */
  preview?: ReactNode;
  /**
   * When true, the whole row toggles (Asset contents).
   * When false, only the trailing preview/chevron control toggles so the label can own rename.
   */
  toggleEntireRow?: boolean;
  toggleAriaLabel: string;
};

/**
 * Shared collapsed expandable entity header.
 * Owns height (h-11 / 44px), padding, and chevron — panes supply label + optional preview only.
 */
export function SettingsExpandableEntryHeader({
  expanded,
  onToggle,
  label,
  preview,
  toggleEntireRow = false,
  toggleAriaLabel,
}: SettingsExpandableEntryHeaderProps) {
  const chevron = expanded ? (
    <ChevronDown size={16} strokeWidth={2} className="shrink-0 text-gray-500" aria-hidden />
  ) : (
    <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-gray-500" aria-hidden />
  );

  const trailing = (
    <>
      {preview != null ? (
        <span className={SETTINGS_EXPANDABLE_ENTRY_PREVIEW_SLOT_CLASS}>{preview}</span>
      ) : null}
      {chevron}
    </>
  );

  if (toggleEntireRow) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`${SETTINGS_EXPANDABLE_ENTRY_HEADER_CLASS} text-left transition-colors hover:bg-gray-50`}
        aria-expanded={expanded}
        aria-label={toggleAriaLabel}
      >
        <div className={`${nameDisplayClass} pointer-events-none`}>{label}</div>
        {trailing}
      </button>
    );
  }

  return (
    <div className={SETTINGS_EXPANDABLE_ENTRY_HEADER_CLASS}>
      {label}
      <button
        type="button"
        onClick={onToggle}
        className="flex h-7 shrink-0 items-center gap-2 rounded-md transition-colors hover:bg-gray-50"
        aria-expanded={expanded}
        aria-label={toggleAriaLabel}
      >
        {trailing}
      </button>
    </div>
  );
}
