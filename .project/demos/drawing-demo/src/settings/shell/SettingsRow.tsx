import type { ReactNode } from 'react';

type SettingsRowProps = {
  label: string;
  description?: string;
  children: ReactNode;
  /** Optional leading icon to the left of the label. */
  icon?: ReactNode;
  /**
   * Escape hatch only. Prefer the default (`font-normal`) so field labels stay quieter than
   * entry names (`SettingsExpandableEntryName` / `font-medium`). Do not use for per-pane
   * densify tweaks — change the default or a shared variant instead.
   */
  labelClassName?: string;
  className?: string;
};

export function SettingsRow({
  label,
  description,
  children,
  icon,
  labelClassName = 'font-normal',
  className = 'px-2 py-2',
}: SettingsRowProps) {
  return (
    <div className={`flex items-center justify-between gap-6 ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
        {icon ? <span className="shrink-0 text-gray-500">{icon}</span> : null}
        <div className="min-w-0">
          <div className={`text-sm text-gray-900 ${labelClassName}`}>{label}</div>
          {description ? (
            <div className="mt-0.5 text-xs text-gray-500">{description}</div>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 px-2">{children}</div>
    </div>
  );
}
