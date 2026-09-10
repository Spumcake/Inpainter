import type { ReactNode } from 'react';

type SettingsSectionProps = {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** When false, children render without divide-y (expandable lists). Default true. */
  divided?: boolean;
};

export function SettingsSection({
  title,
  children,
  footer,
  divided = true,
}: SettingsSectionProps) {
  return (
    <section className="overflow-hidden rounded-md border border-chrome-border bg-white">
      {title ? (
        <header className="border-b border-gray-100 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <div className="px-2">{title}</div>
        </header>
      ) : null}
      {divided ? (
        <div className="divide-y divide-gray-100">{children}</div>
      ) : (
        children
      )}
      {footer ? (
        <div className="flex justify-end border-t border-gray-100 px-2 py-2">{footer}</div>
      ) : null}
    </section>
  );
}
