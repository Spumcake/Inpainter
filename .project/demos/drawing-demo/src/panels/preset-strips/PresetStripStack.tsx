import { Ellipsis } from 'lucide-react';
import { useHorizontalSlotDrag } from './useHorizontalSlotDrag';

type PresetStripShellProps = {
  active: boolean;
  title: string;
  activeAriaLabel: string;
  onActivate?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function PresetStripShell({
  active,
  title,
  activeAriaLabel,
  onActivate,
  children,
  footer,
}: PresetStripShellProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <section
        className={`flex h-[35px] w-auto items-center overflow-hidden rounded-full border bg-white ${
          active ? 'border-gray-200' : 'border-gray-200/80 opacity-70 hover:opacity-100'
        }`}
        role={active ? 'dialog' : undefined}
        aria-modal={active ? true : undefined}
        aria-label={active ? activeAriaLabel : title}
        title={title}
        onClick={active ? undefined : onActivate}
      >
        <div className="flex h-full items-center gap-[5px] px-[5px] py-0">{children}</div>
      </section>
      {active && footer ? footer : null}
    </div>
  );
}

type PresetStripStackProps = {
  children: React.ReactNode;
  onMore: () => void;
  moreTitle?: string;
};

export function PresetStripStack({
  children,
  onMore,
  moreTitle = 'More',
}: PresetStripStackProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex max-h-[min(60vh,420px)] flex-col items-center gap-2 overflow-y-auto">
        {children}
      </div>
      <button
        type="button"
        title={moreTitle}
        className="inline-flex h-[18px] items-center justify-center rounded-full border border-gray-200 bg-white px-1.5 text-black"
        onClick={onMore}
      >
        <Ellipsis size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export { useHorizontalSlotDrag };
