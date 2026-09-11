import { useState } from "react";
import { Box, FolderPlus, Plus, type LucideIcon } from "lucide-react";
import type { PlaceholderAction, PlaceholderDestinationViewProps } from "../shared/types";

const actionIcons: Record<string, LucideIcon> = {
  "folder-plus": FolderPlus,
  plus: Plus,
};

function ActionIcon({ name }: { name: string }) {
  const Icon = actionIcons[name] ?? Box;
  return <Icon size={14} />;
}

function actionClass(tone: string): string {
  if (tone === "accent") {
    return "flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm font-medium text-black hover:bg-neutral-200";
  }
  return "flex items-center gap-1.5 rounded-full bg-[#333333] px-3 py-1 text-sm font-medium text-neutral-200 hover:bg-[#3a3a3a]";
}

export default function PlaceholderDestinationView({
  content,
  onAction,
}: PlaceholderDestinationViewProps) {
  const [note, setNote] = useState<string | null>(null);

  const handleAction = (action: PlaceholderAction) => {
    if (!action.available) {
      setNote(action.unavailableReason ?? "This action isn't available yet.");
      return;
    }
    setNote(null);
    onAction?.(action.id);
  };

  const isEmptyState = Boolean(content.title && content.actions.length > 0);

  return (
    <div className="flex-1 flex items-center justify-center bg-[#1c1c1c] text-neutral-500">
      <div className={`flex flex-col items-center gap-3 ${isEmptyState ? "-translate-y-8" : ""}`}>
      <Box size={48} className="opacity-20" />
      {content.title ? <h2 className="text-white text-lg font-semibold">{content.title}</h2> : null}
      <p className="text-sm text-neutral-400">{content.message}</p>
      {content.actions.length > 0 ? (
        <div className="flex items-center gap-3 mt-1">
          {content.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleAction(action)}
              className={actionClass(action.tone)}
            >
              <ActionIcon name={action.icon} />
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {note ? <p className="text-xs text-neutral-500 mt-1">{note}</p> : null}
      </div>
    </div>
  );
}

export function PlaceholderDestinationSkeleton() {
  return (
    <div
      className="flex-1 flex items-center justify-center bg-[#1c1c1c] flex-col gap-4 -translate-y-8"
      aria-busy="true"
      aria-label="Loading destination"
    >
      <span className="browser-skeleton h-12 w-12 rounded" />
      <span className="browser-skeleton h-3 w-56" />
    </div>
  );
}
