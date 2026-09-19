import { v4 as uuidv4 } from "uuid";

import { cloneProject } from "../freeze.ts";
import { calculateProjectDuration } from "../duration.ts";
import type { ProductionDocument } from "../types.ts";
import { ActionHistory } from "./history.ts";
import { getActionHandler } from "./registry.ts";
import type { Action, ActionResult } from "./types.ts";

export class ActionExecutor {
  private readonly history: ActionHistory;
  private readonly lastAddedIds = new Map<string, string>();

  constructor(history?: ActionHistory) {
    this.history = history ?? new ActionHistory();
  }

  execute(action: Action, project: ProductionDocument): ActionResult {
    const prepared = prepareAction(action);
    const handler = getActionHandler(prepared.type);
    if (!handler) {
      return {
        success: false,
        error: { code: "UNKNOWN_ACTION_TYPE", message: `Unknown action type: ${prepared.type}` },
      };
    }
    const validation = handler.validate(prepared, project);
    if (!validation.valid) {
      return {
        success: false,
        error: {
          code: "INVALID_PARAMS",
          message: validation.errors.map((error) => error.message).join("; "),
        },
      };
    }
    const before = cloneProject(project);
    const next = cloneProject(project);
    try {
      handler.apply(prepared, next, { lastAddedIds: this.lastAddedIds });
      next.modifiedAt = Date.now();
      next.timeline = { ...next.timeline, duration: calculateProjectDuration(next) };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "INVALID_PARAMS",
          message: error instanceof Error ? error.message : "Unknown error occurred",
        },
      };
    }
    replaceProject(project, next);
    const inverse = handler.invert(prepared, before);
    this.history.push(prepared, inverse);
    return { success: true, actionId: prepared.id };
  }

  /**
   * Applies actions in order and stops at the first failure.
   * Earlier successes stay applied and in history. This is not a transaction
   * and does not roll back.
   */
  executeMany(actions: Action[], project: ProductionDocument): ActionResult[] {
    const results: ActionResult[] = [];
    for (const action of actions) {
      const result = this.execute(action, project);
      results.push(result);
      if (!result.success) {
        break;
      }
    }
    return results;
  }

  undo(project: ProductionDocument): ActionResult {
    if (!this.history.canUndo()) {
      return { success: false, error: { code: "INVALID_PARAMS", message: "Nothing to undo" } };
    }
    const inverse = this.history.undo();
    if (!inverse) {
      return { success: false, error: { code: "INVALID_PARAMS", message: "No inverse action available" } };
    }
    return this.applyWithoutHistory(inverse, project);
  }

  redo(project: ProductionDocument): ActionResult {
    if (!this.history.canRedo()) {
      return { success: false, error: { code: "INVALID_PARAMS", message: "Nothing to redo" } };
    }
    const action = this.history.redo();
    if (!action) {
      return { success: false, error: { code: "INVALID_PARAMS", message: "No action to redo" } };
    }
    return this.applyWithoutHistory(action, project);
  }

  getHistory(): ActionHistory {
    return this.history;
  }

  private applyWithoutHistory(action: Action, project: ProductionDocument): ActionResult {
    const handler = getActionHandler(action.type);
    if (!handler) {
      return {
        success: false,
        error: { code: "UNKNOWN_ACTION_TYPE", message: `Unknown action type: ${action.type}` },
      };
    }
    const next = cloneProject(project);
    try {
      handler.apply(action, next, { lastAddedIds: this.lastAddedIds });
      next.modifiedAt = Date.now();
      next.timeline = { ...next.timeline, duration: calculateProjectDuration(next) };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "INVALID_PARAMS",
          message: error instanceof Error ? error.message : "Apply failed",
        },
      };
    }
    replaceProject(project, next);
    return { success: true, actionId: action.id };
  }
}

function prepareAction(action: Action): Action {
  return {
    type: action.type,
    id: action.id || uuidv4(),
    timestamp: action.timestamp || Date.now(),
    params: { ...action.params },
  };
}

function replaceProject(target: ProductionDocument, source: ProductionDocument): void {
  for (const key of Object.keys(target)) {
    delete (target as Record<string, unknown>)[key];
  }
  Object.assign(target, source);
}
