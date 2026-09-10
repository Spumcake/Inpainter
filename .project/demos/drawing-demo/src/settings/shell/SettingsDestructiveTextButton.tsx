import type { ButtonHTMLAttributes } from 'react';

const destructiveTextClass =
  'text-xs font-medium text-red-600 transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40';

type SettingsDestructiveTextButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** Shared text-style Remove actions inside settings (list expand footers, pane footers). */
export function SettingsDestructiveTextButton({
  className,
  type = 'button',
  ...props
}: SettingsDestructiveTextButtonProps) {
  return (
    <button
      type={type}
      className={className ? `${destructiveTextClass} ${className}` : destructiveTextClass}
      {...props}
    />
  );
}
