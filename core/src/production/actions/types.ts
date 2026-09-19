export type Action = {
  type: string;
  id: string;
  timestamp: number;
  params: Record<string, unknown>;
};

export type ValidationError = {
  code: string;
  message: string;
  path?: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

export type ActionResult =
  | { success: true; actionId: string }
  | { success: false; error: { code: string; message: string } };

export type ActionHandlerContext = {
  readonly lastAddedIds: Map<string, string>;
};

export type HistoryEntry = {
  action: Action;
  inverseAction: Action | null;
  timestamp: number;
  description: string;
};
