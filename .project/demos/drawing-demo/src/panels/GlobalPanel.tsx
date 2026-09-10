import { useEffect, type ReactNode } from 'react';
import {
  CHROME_LIST_ITEM_ACTIVE,
  CHROME_LIST_ITEM_DEFAULT,
  CHROME_LIST_ITEM_FUTURE,
} from '../chrome';
import type { GlobalPanelListItem } from './types';

export type GlobalPanelAppearance = 'light' | 'dark';
export type GlobalPanelSize = 'compact' | 'wide';

type GlobalPanelProps = {
  ariaLabel: string;
  onClose: () => void;
  items?: GlobalPanelListItem[];
  emptyLabel?: string;
  children?: ReactNode;
  footer?: ReactNode;
  appearance?: GlobalPanelAppearance;
  size?: GlobalPanelSize;
  /** Fixed dialog width in px; overrides responsive `size` width. */
  widthPx?: number;
  /** Fixed dialog height in px; content scrolls when it overflows. */
  heightPx?: number;
  /** Orange accent scrollbar thumb (Prompt Compiler). */
  scrollAccent?: boolean;
};

export function GlobalPanel({
  ariaLabel,
  onClose,
  items,
  emptyLabel = 'No items',
  children,
  footer,
  appearance = 'light',
  size = 'compact',
  widthPx,
  heightPx,
  scrollAccent = false,
}: GlobalPanelProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const dark = appearance === 'dark';
  const wide = size === 'wide';
  const fixedWidth = widthPx != null;
  const fixedHeight = heightPx != null;

  const heightClass = fixedHeight
    ? 'overflow-hidden'
    : wide || fixedWidth
      ? 'max-h-[min(80vh,640px)] overflow-hidden'
      : 'max-h-[min(70vh,480px)] overflow-hidden';

  const widthClass = fixedWidth
    ? 'shrink-0'
    : wide
      ? 'w-full max-w-3xl'
      : 'w-full max-w-sm';

  const dialogClass = dark
    ? `flex flex-col rounded-lg border border-white/10 bg-black p-1 text-white ${heightClass} ${widthClass}`
    : `flex flex-col rounded-lg border border-chrome-border bg-chrome-surface p-1 ${heightClass} ${widthClass}`;

  const dialogStyle =
    fixedWidth || fixedHeight
      ? {
          ...(fixedWidth ? { width: widthPx } : null),
          ...(fixedHeight ? { height: heightPx } : null),
        }
      : undefined;

  const emptyClass = dark
    ? 'px-3 py-2 text-xs text-white/40'
    : 'px-3 py-2 text-xs text-chrome-muted';

  const metaSepClass = dark ? 'text-white/30' : 'text-gray-300';
  const metaClass = dark ? 'text-white/40' : 'text-chrome-muted';

  const itemClass = (item: GlobalPanelListItem) => {
    if (dark) {
      if (item.isActive) return 'bg-white/15 text-white';
      if (item.isFuture) return 'text-white/35';
      return 'text-white/80 hover:bg-white/10';
    }
    if (item.isActive) return CHROME_LIST_ITEM_ACTIVE;
    if (item.isFuture) return CHROME_LIST_ITEM_FUTURE;
    return CHROME_LIST_ITEM_DEFAULT;
  };

  return (
    <div
      className="absolute inset-0 flex items-start justify-center bg-chrome-scrim pt-12"
      onMouseDown={onClose}
    >
      <section
        className={dialogClass}
        style={dialogStyle}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <div
          className={`global-panel-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${
            scrollAccent ? 'global-panel-scroll-accent' : ''
          }`}
        >
          {children ?? (
            <ol>
              {items && items.length === 0 ? (
                <li className={emptyClass}>{emptyLabel}</li>
              ) : (
                items?.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={item.onSelect}
                      className={`block w-full truncate px-3 py-1 text-left text-xs transition-colors ${itemClass(item)}`}
                    >
                      {item.label}
                      {item.meta ? (
                        <>
                          <span className={metaSepClass}> · </span>
                          <span className={metaClass}>{item.meta}</span>
                        </>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ol>
          )}
        </div>
        {footer}
      </section>
    </div>
  );
}
