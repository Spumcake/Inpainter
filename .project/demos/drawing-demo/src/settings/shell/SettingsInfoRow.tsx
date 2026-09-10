import type { ReactNode } from 'react';

type SettingsInfoRowProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Settings row for prose / informational values (About, Change Log, etc.).
 * Value slot shrinks and wraps — unlike SettingsRow, which keeps controls at intrinsic width.
 */
export function SettingsInfoRow({
  label,
  children,
  className = 'px-2 py-2',
}: SettingsInfoRowProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="shrink-0 px-2 text-sm font-medium text-gray-900">{label}</div>
      <div className="min-w-0 flex-1 px-2">{children}</div>
    </div>
  );
}
