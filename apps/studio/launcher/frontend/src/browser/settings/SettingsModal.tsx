import { useEffect, useState } from "react";
import { Folder, Loader2, Minus, Plus } from "lucide-react";
import { getSettings } from "../shared/browserApi";
import BrowserModal from "../shared/BrowserModal";
import type { SettingsField, SettingsModalProps, SettingsPayload } from "../shared/types";

function ActivityIndicator({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center" aria-busy="true" aria-label={label}>
      <Loader2 size={28} className="animate-spin text-neutral-400" />
    </div>
  );
}

function PathField({ field }: { field: Extract<SettingsField, { kind: "path" }> }) {
  return (
    <div className="mb-8">
      <h3 className="text-white font-semibold mb-1 text-sm">{field.title}</h3>
      <p className="text-xs text-neutral-500 mb-3">{field.description}</p>
      <div className="flex items-center relative">
        <input
          type="text"
          value={field.value}
          readOnly
          className="w-full bg-[#2a2a2a] border border-[#444] rounded p-2 text-sm text-neutral-300 pr-10 focus:outline-none"
        />
        <Folder className="absolute right-3 text-neutral-500" size={16} />
      </div>
    </div>
  );
}

function NumberField({ field }: { field: Extract<SettingsField, { kind: "number" }> }) {
  const [value, setValue] = useState(field.value);

  useEffect(() => {
    setValue(field.value);
  }, [field.id, field.value]);

  return (
    <div className="mb-8 pb-8 border-b border-[#333]">
      <h3 className="text-white font-semibold mb-1 text-sm">{field.title}</h3>
      <p className="text-xs text-neutral-500 mb-3">{field.description}</p>
      <div className="flex items-center">
        <div className="flex items-center bg-[#2a2a2a] border border-[#444] rounded">
          <button
            className="px-3 py-1 text-neutral-500 hover:text-white border-r border-[#444]"
            onClick={() => setValue((current) => Math.max(field.min, current - 1))}
            aria-label={`Decrease ${field.title}`}
          >
            <Minus size={14} />
          </button>
          <span className="px-4 py-1 text-sm font-medium text-white w-12 text-center">{value}</span>
          <button
            className="px-3 py-1 text-neutral-500 hover:text-white border-l border-[#444]"
            onClick={() => setValue((current) => Math.min(field.max, current + 1))}
            aria-label={`Increase ${field.title}`}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function BoolField({ field }: { field: Extract<SettingsField, { kind: "bool" }> }) {
  const [checked, setChecked] = useState(field.value);

  useEffect(() => {
    setChecked(field.value);
  }, [field.id, field.value]);

  return (
    <div>
      <h3 className="text-white font-semibold mb-1 text-sm">{field.title}</h3>
      <p className="text-xs text-neutral-500 mb-3">{field.description}</p>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="w-4 h-4 rounded border-neutral-600 bg-[#2a2a2a]"
        />
        <span className="text-sm">{field.label}</span>
      </div>
    </div>
  );
}

function SettingsFields({ fields }: { fields: SettingsField[] }) {
  return (
    <>
      {fields.map((field) => {
        if (field.kind === "path") return <PathField key={field.id} field={field} />;
        if (field.kind === "number") return <NumberField key={field.id} field={field} />;
        if (field.kind === "bool") return <BoolField key={field.id} field={field} />;
        return (
          <p key={field.message} className="text-sm text-neutral-500">
            {field.message}
          </p>
        );
      })}
    </>
  );
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setError(null);
    getSettings()
      .then((next) => {
        if (!cancelled) setPayload(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load settings");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectCategory = (categoryId: string) => {
    if (!payload || payload.selectedCategory === categoryId || panelLoading) return;
    setPanelLoading(true);
    setError(null);
    getSettings(categoryId)
      .then((next) => setPayload(next))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setPanelLoading(false));
  };

  return (
    <BrowserModal title={payload?.title ?? "Settings"} badge={payload?.versionLabel} onClose={onClose}>
      {!payload && !error ? (
        <ActivityIndicator label="Loading settings" />
      ) : error && !payload ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-400 px-6">{error}</div>
      ) : payload ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[220px] bg-[#1a1a1a] border-r border-[#333] py-2 overflow-y-auto">
            {payload.categories.map((item) => (
              <button
                key={item.id}
                onClick={() => selectCategory(item.id)}
                className={`w-full text-left px-5 py-2.5 text-sm font-medium ${
                  item.id === payload.selectedCategory
                    ? "bg-[#333333] text-white"
                    : "text-neutral-300 hover:bg-[#2a2a2a] hover:text-neutral-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-8 overflow-y-auto bg-[#1c1c1c] text-neutral-300 flex flex-col">
            {panelLoading ? (
              <ActivityIndicator label="Loading settings category" />
            ) : error ? (
              <div className="text-sm text-red-400">{error}</div>
            ) : (
              <SettingsFields key={payload.panel.categoryId} fields={payload.panel.fields} />
            )}
          </div>
        </div>
      ) : null}
    </BrowserModal>
  );
}
