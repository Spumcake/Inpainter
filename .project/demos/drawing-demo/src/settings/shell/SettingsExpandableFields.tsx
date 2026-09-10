import type { ReactNode } from 'react';

type SettingsExpandableFieldsProps = {
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Expanded body under an entity list header.
 * Field rows must use default SettingsRow — no gray wash, no custom indent.
 */
export function SettingsExpandableFields({
  children,
  footer,
}: SettingsExpandableFieldsProps) {
  return (
    <div className="border-t border-gray-100">
      <div className="divide-y divide-gray-100">{children}</div>
      {footer ? (
        <div className="flex justify-end border-t border-pink-100 bg-[rgba(255,242,244,1)] px-2 py-2">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
