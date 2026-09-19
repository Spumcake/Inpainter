import type { ProductionDocument } from "../types.ts";
import type { Action, ActionHandlerContext, ValidationResult } from "./types.ts";

export type ActionHandler = {
  readonly type: string;
  apply(action: Action, project: ProductionDocument, ctx: ActionHandlerContext): void;
  validate(action: Action, project: ProductionDocument): ValidationResult;
  invert(action: Action, projectBefore: ProductionDocument): Action | null;
};

const registry = new Map<string, ActionHandler>();

export function registerActionHandler(handler: ActionHandler): void {
  registry.set(handler.type, handler);
}

export function getActionHandler(type: string): ActionHandler | undefined {
  return registry.get(type);
}

export function listRegisteredActionTypes(): string[] {
  return [...registry.keys()];
}

export function createInverseAction(
  originalAction: Action,
  type: string,
  params: Record<string, unknown>,
): Action {
  return {
    type,
    id: `inverse-${originalAction.id}`,
    timestamp: Date.now(),
    params,
  };
}
