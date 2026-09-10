import type { HistoryEntry } from '../authoring/history/types';
import type { GlobalPanelListItem } from './types';

/** History index for the Document state before the first Command (-1). */
export const HISTORY_LAUNCH_INDEX = -1;
export const HISTORY_LAUNCH_LABEL = 'Launch →';

export function buildHistoryItems(
  entries: readonly Pick<HistoryEntry, 'label'>[],
  pointer: number,
  onJump: (index: number) => void,
): GlobalPanelListItem[] {
  if (entries.length === 0) {
    return [];
  }

  const launch: GlobalPanelListItem = {
    id: 'launch',
    label: HISTORY_LAUNCH_LABEL,
    isActive: pointer === HISTORY_LAUNCH_INDEX,
    isFuture: false,
    onSelect: () => onJump(HISTORY_LAUNCH_INDEX),
  };

  const commandItems = entries.map((entry, index) => ({
    id: String(index),
    label: entry.label,
    isActive: index === pointer,
    isFuture: index > pointer,
    onSelect: () => onJump(index),
  }));

  return [launch, ...commandItems];
}
