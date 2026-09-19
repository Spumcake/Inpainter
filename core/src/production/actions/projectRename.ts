import type { ProductionDocument } from "../types.ts";
import { createInverseAction, type ActionHandler } from "./registry.ts";
import type { Action, ValidationResult } from "./types.ts";

export const projectRenameHandler: ActionHandler = {
  type: "project/rename",
  validate(action: Action): ValidationResult {
    const name = action.params.name;
    if (typeof name !== "string" || !name.trim()) {
      return {
        valid: false,
        errors: [
          {
            code: "INVALID_PARAMS",
            message: "Project name is required and must be a string",
            path: "params.name",
          },
        ],
      };
    }
    return { valid: true, errors: [] };
  },
  apply(action: Action, project: ProductionDocument): void {
    project.name = String(action.params.name).trim();
  },
  invert(action: Action, projectBefore: ProductionDocument): Action {
    return createInverseAction(action, "project/rename", { name: projectBefore.name });
  },
};
