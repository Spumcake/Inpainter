import type { SettingsFieldDef, SettingValue } from '../types';

type ControlRendererProps = {
  field: SettingsFieldDef;
  value: SettingValue;
  onChange: (value: SettingValue) => void;
};

/** Shared text/number/select chrome — panes may add width / mono only. Dense Desktop sizing. */
export const SETTINGS_CONTROL_INPUT_CLASS =
  'box-border h-7 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300';

export function ControlRenderer({ field, value, onChange }: ControlRendererProps) {
  switch (field.control) {
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next === '' ? 0 : Number(next));
          }}
          className={`${SETTINGS_CONTROL_INPUT_CLASS} w-20 text-right`}
        />
      );

    case 'text':
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className={`${SETTINGS_CONTROL_INPUT_CLASS} w-40`}
        />
      );

    case 'password':
      return (
        <input
          type="password"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className={`${SETTINGS_CONTROL_INPUT_CLASS} w-40`}
          autoComplete="off"
        />
      );

    case 'select':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className={`${SETTINGS_CONTROL_INPUT_CLASS} w-32`}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );

    case 'segmented': {
      const options = field.options ?? [];
      return (
        <div className="inline-flex h-7 overflow-hidden rounded-md border border-gray-300 bg-white">
          {options.map((option) => {
            const isActive = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className={`px-2 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }

    case 'slider':
      return (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={typeof value === 'number' ? value : 0}
            onChange={(event) => onChange(Number(event.target.value))}
            className="h-7 w-28 accent-gray-900"
          />
          <span className="w-7 text-right text-xs tabular-nums text-gray-600">
            {typeof value === 'number' ? value : 0}
          </span>
        </div>
      );

    default:
      return null;
  }
}
