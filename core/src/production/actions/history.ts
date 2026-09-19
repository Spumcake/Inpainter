import type { Action, HistoryEntry } from "./types.ts";

const DESCRIPTIONS: Record<string, string> = {
  "project/rename": "Rename project",
  "track/add": "Add track",
  "track/remove": "Remove track",
  "track/restore": "Restore track",
  "motion/updateLayerText": "Update layer text",
  "motion/updateLayerKeyframeTime": "Update keyframe time",
};

export class ActionHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  push(action: Action, inverseAction: Action | null = null): void {
    this.undoStack.push({
      action,
      inverseAction,
      timestamp: Date.now(),
      description: DESCRIPTIONS[action.type] ?? action.type,
    });
    this.redoStack = [];
  }

  undo(): Action | null {
    const entry = this.undoStack.pop();
    if (!entry) {
      return null;
    }
    this.redoStack.push(entry);
    return entry.inverseAction;
  }

  redo(): Action | null {
    const entry = this.redoStack.pop();
    if (!entry) {
      return null;
    }
    this.undoStack.push(entry);
    return entry.action;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getEntries(): HistoryEntry[] {
    return [...this.undoStack];
  }

  getRedoEntries(): HistoryEntry[] {
    return [...this.redoStack];
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
