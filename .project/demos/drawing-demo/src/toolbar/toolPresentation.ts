import {
  Eraser,
  MousePointer2,
  Paintbrush,
  Plus,
  type LucideIcon,
} from 'lucide-react';

const TOOL_ICONS = {
  createFrame: Plus,
  createSketch: Plus,
  select: MousePointer2,
  paint: Paintbrush,
  erase: Eraser,
} as const;

const TOOL_LABELS = {
  createFrame: 'Add frame',
  createSketch: 'Add sketch',
  select: 'Select',
  paint: 'Paint',
  erase: 'Erase',
} as const;

export type ToolPresentation = {
  Icon: LucideIcon;
  label: string;
};

/** Shared tool icon + strip label — consumed by ToolbarShell and Edit destinations. */
export function presentationForTool(toolId: string): ToolPresentation {
  const Icon =
    TOOL_ICONS[toolId as keyof typeof TOOL_ICONS] ?? Paintbrush;
  const label =
    TOOL_LABELS[toolId as keyof typeof TOOL_LABELS] ?? toolId;
  return { Icon, label };
}
