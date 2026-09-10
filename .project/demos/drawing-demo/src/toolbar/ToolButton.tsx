import type { ReactNode } from 'react';

type ToolButtonProps = {
  label: string;
  active: boolean;
  /** Fade overlay — chrome idle-look peers and Node-incompatible disabled tools. */
  muted?: boolean;
  disabled?: boolean;
  /** `onDark` = black toolbar pill; `onLight` = light Prompt Editor pill. */
  tone?: 'onDark' | 'onLight';
  onClick: () => void;
  children: ReactNode;
};

export function ToolButton({
  label,
  active,
  muted = false,
  disabled = false,
  tone = 'onDark',
  onClick,
  children,
}: ToolButtonProps) {
  const showMuteOverlay = muted && !active;
  const light = tone === 'onLight';

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      data-toolbar-tool={label.toLowerCase()}
      onClick={onClick}
      className={`group relative flex h-[31px] w-[31px] items-center justify-center rounded-full transition-none disabled:cursor-default disabled:opacity-100 ${
        active
          ? light
            ? 'bg-gray-900 text-white'
            : 'bg-white text-black'
          : light
            ? 'text-gray-700 hover:bg-gray-100'
            : 'text-white hover:bg-white/10'
      }`}
    >
      {children}
      {showMuteOverlay ? (
        <span
          aria-hidden
          className={
            light
              ? 'pointer-events-none absolute inset-0 rounded-full bg-white/55 group-hover:bg-white/25'
              : 'pointer-events-none absolute inset-0 rounded-full bg-black/40 group-hover:bg-black/15'
          }
        />
      ) : null}
    </button>
  );
}
