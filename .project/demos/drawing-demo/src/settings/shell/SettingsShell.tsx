import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { HEADER_HEIGHT } from '../../window/hitBands';

export type SettingsShellLayout = 'modal' | 'window';

type SettingsShellProps = {
  title: string;
  nav: ReactNode;
  children: ReactNode;
  onClose: () => void;
  layout?: SettingsShellLayout;
  /**
   * Initial fitted-modal height in px. Defaults to 260.
   * Still clampable by drag / viewport (min 260, max viewport budget).
   */
  defaultHeight?: number;
};

const DIALOG_WIDTH = 530;
const DIALOG_DEFAULT_HEIGHT = 260;
const DIALOG_MIN_HEIGHT = 260;
/** Keep a little air under the elongated card. */
const DIALOG_BOTTOM_MARGIN = 16;
/**
 * Fill breakpoints stay on the prior fitted size (720×330) so narrowing /
 * shortening the window still trips fill after the dialog was reduced to 530×260.
 */
const FITS_MODAL_MIN_WIDTH = 720;
const FITS_MODAL_MIN_HEIGHT = 330;
/** Same as GlobalPanel / ToolConfigModal `pt-12` (fitted modal only). */
const PANEL_TOP_OFFSET = 48;

function maxFittedDialogHeight(): number {
  if (typeof window === 'undefined') return DIALOG_DEFAULT_HEIGHT;
  return Math.max(
    DIALOG_MIN_HEIGHT,
    window.innerHeight - PANEL_TOP_OFFSET - DIALOG_BOTTOM_MARGIN,
  );
}

function clampFittedDialogHeight(height: number): number {
  return Math.min(maxFittedDialogHeight(), Math.max(DIALOG_MIN_HEIGHT, height));
}

function useFitsModalDialog(topOffset: number): boolean {
  const [fits, setFits] = useState(() => {
    if (typeof window === 'undefined') return true;
    return (
      window.innerWidth >= FITS_MODAL_MIN_WIDTH &&
      window.innerHeight - topOffset >= FITS_MODAL_MIN_HEIGHT
    );
  });

  useEffect(() => {
    const update = () => {
      const next =
        window.innerWidth >= FITS_MODAL_MIN_WIDTH &&
        window.innerHeight - topOffset >= FITS_MODAL_MIN_HEIGHT;
      setFits((prev) => (prev === next ? prev : next));
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [topOffset]);

  return fits;
}

export function SettingsShell({
  title,
  nav,
  children,
  onClose,
  layout = 'modal',
  defaultHeight = DIALOG_DEFAULT_HEIGHT,
}: SettingsShellProps) {
  const fitsModal = useFitsModalDialog(layout === 'modal' ? PANEL_TOP_OFFSET : 0);
  const initialHeight = clampFittedDialogHeight(
    Math.max(DIALOG_MIN_HEIGHT, defaultHeight),
  );
  const [dialogHeight, setDialogHeight] = useState(initialHeight);

  useEffect(() => {
    setDialogHeight(
      clampFittedDialogHeight(Math.max(DIALOG_MIN_HEIGHT, defaultHeight)),
    );
  }, [defaultHeight]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!fitsModal) return;
    const clamp = () => {
      setDialogHeight((height) => clampFittedDialogHeight(height));
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [fitsModal]);

  const onBottomResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startY = event.clientY;
    const startHeight = dialogHeight;
    handle.setPointerCapture(pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - startY;
      setDialogHeight(clampFittedDialogHeight(Math.round(startHeight + delta)));
    };

    const onUp = (upEvent: PointerEvent) => {
      if (handle.hasPointerCapture(upEvent.pointerId)) {
        handle.releasePointerCapture(upEvent.pointerId);
      }
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  if (layout === 'window') {
    return (
      <div
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className="flex h-full w-full overflow-hidden bg-white"
      >
        <aside className="flex w-44 shrink-0 flex-col border-r border-chrome-border bg-white p-2.5">
          {nav}
        </aside>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">{children}</main>
      </div>
    );
  }

  const shell = (
    <>
      <aside className="flex w-44 shrink-0 flex-col border-r border-chrome-border bg-white p-2.5">
        {nav}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">{children}</main>
    </>
  );

  return (
    <div className="absolute inset-0 z-40 bg-chrome-scrim" onMouseDown={onClose}>
      {fitsModal ? (
        <div className="flex h-full items-start justify-center pt-12">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative flex shrink-0 overflow-hidden rounded-chrome-panel border border-chrome-border bg-white"
            style={{ height: dialogHeight, width: DIALOG_WIDTH }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {shell}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize settings"
              aria-valuemin={DIALOG_MIN_HEIGHT}
              aria-valuemax={maxFittedDialogHeight()}
              aria-valuenow={dialogHeight}
              className="absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize touch-none"
              onPointerDown={onBottomResizePointerDown}
            />
          </div>
        </div>
      ) : (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="absolute inset-x-0 bottom-0 flex overflow-hidden bg-white"
          style={{ top: HEADER_HEIGHT }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {shell}
        </div>
      )}
    </div>
  );
}
