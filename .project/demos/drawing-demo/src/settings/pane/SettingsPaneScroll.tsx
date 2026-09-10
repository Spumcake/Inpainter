import type { ReactNode } from 'react';

export const SETTINGS_PANE_SCROLL_CLASS =
  'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3';

type SettingsPaneScrollProps = {
  children: ReactNode;
  className?: string;
};

export function SettingsPaneScroll({
  children,
  className = SETTINGS_PANE_SCROLL_CLASS,
}: SettingsPaneScrollProps) {
  return <div className={className}>{children}</div>;
}
