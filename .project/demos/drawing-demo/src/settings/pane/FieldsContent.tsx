import { ControlRenderer } from '../controls/ControlRenderer';
import { SettingsRow } from '../shell/SettingsRow';
import { SettingsSection } from '../shell/SettingsSection';
import type { SettingsFieldDef, SettingValue } from '../types';

type FieldsContentProps = {
  fields: SettingsFieldDef[];
  values: Record<string, SettingValue>;
  onPatch: (partial: Record<string, SettingValue>) => void;
  sectionTitle?: string;
};

export function FieldsContent({
  fields,
  values,
  onPatch,
  sectionTitle,
}: FieldsContentProps) {
  return (
    <SettingsSection>
      {fields.map((field) => (
        <SettingsRow key={field.key} label={field.label} description={field.description}>
          <ControlRenderer
            field={field}
            value={values[field.key] ?? field.default}
            onChange={(next) => onPatch({ [field.key]: next })}
          />
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}
