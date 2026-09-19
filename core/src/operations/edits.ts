import { CoreError } from "../errors.ts";
import { ActionExecutor, registerFoundationActions, type Action } from "../production/actions/index.ts";
import { cloneProject, freezeProject } from "../production/freeze.ts";
import { SCHEMA_VERSION } from "../production/serializer.ts";
import type { AssetIndex, DocumentSnapshot, ProductionDocument } from "../production/types.ts";
import {
  acquireWriterLock,
  heartbeatWriterLock,
  releaseWriterLock,
  type DocumentLock,
} from "./documentLock.ts";
import { openDocument, saveDocument } from "./documents.ts";

export type EditActionInput = {
  type: string;
  params?: Record<string, unknown>;
  id?: string;
};

export type EditHistoryItem = {
  id: string;
  type: string;
  description: string;
};

export type EditState = {
  snapshot: DocumentSnapshot;
  canUndo: boolean;
  canRedo: boolean;
  history: EditHistoryItem[];
  handle: string;
  generation: number;
};

/**
 * In-memory document edit session. Undo history lives in this process only.
 * executeMany applies actions sequentially and stops on the first failure;
 * earlier successes remain. That is not a transaction.
 */
export class EditSession {
  private working: ProductionDocument;
  private assets: AssetIndex;
  private persistRevision: number;
  private readonly path: string;
  private readonly lock: DocumentLock;
  private closed = false;
  private generation = 0;
  private readonly executor = new ActionExecutor();

  constructor(snapshot: DocumentSnapshot, lock: DocumentLock) {
    registerFoundationActions();
    this.path = snapshot.path;
    this.persistRevision = snapshot.revision;
    this.assets = snapshot.assets;
    this.working = cloneProject(snapshot.project);
    this.lock = lock;
  }

  get handle(): string {
    return this.lock.holder;
  }

  execute(input: EditActionInput): EditState {
    this.ensureActive();
    const result = this.executor.execute(toAction(input), this.working);
    if (!result.success) {
      throw new CoreError(result.error.message);
    }
    this.generation += 1;
    return this.state();
  }

  executeMany(inputs: EditActionInput[]): EditState {
    this.ensureActive();
    const results = this.executor.executeMany(inputs.map(toAction), this.working);
    this.generation += results.filter((result) => result.success).length;
    const failed = results.find((result) => !result.success);
    if (failed && !failed.success) {
      throw new CoreError(failed.error.message);
    }
    return this.state();
  }

  undo(): EditState {
    this.ensureActive();
    const result = this.executor.undo(this.working);
    if (!result.success) {
      throw new CoreError(result.error.message);
    }
    this.generation += 1;
    return this.state();
  }

  redo(): EditState {
    this.ensureActive();
    const result = this.executor.redo(this.working);
    if (!result.success) {
      throw new CoreError(result.error.message);
    }
    this.generation += 1;
    return this.state();
  }

  inspect(): EditState {
    this.ensureActive();
    return this.state();
  }

  save(): EditState {
    this.ensureActive();
    const saved = saveDocument({
      path: this.path,
      payload: { project: this.working, assets: this.assets },
      expectedRevision: this.persistRevision,
      lockHolder: this.lock.holder,
    });
    this.persistRevision = saved.revision;
    this.working = cloneProject(saved.project);
    this.assets = saved.assets;
    return this.state();
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    releaseWriterLock(this.path, this.lock.holder);
  }

  private ensureActive(): void {
    if (this.closed) {
      throw new CoreError("Document session is closed.");
    }
    heartbeatWriterLock(this.path, this.lock.holder);
  }

  private state(): EditState {
    const history = this.executor.getHistory();
    return {
      snapshot: toSnapshot(this.path, this.working, this.assets, this.persistRevision, this.generation),
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      history: history.getEntries().map((entry) => ({
        id: entry.action.id,
        type: entry.action.type,
        description: entry.description,
      })),
      handle: this.lock.holder,
      generation: this.generation,
    };
  }
}

export function openEditSession(input: { path: string }): EditSession {
  const snapshot = openDocument(input);
  const lock = acquireWriterLock(snapshot.path);
  try {
    return new EditSession(snapshot, lock);
  } catch (error) {
    releaseWriterLock(snapshot.path, lock.holder);
    throw error;
  }
}

function toAction(input: EditActionInput): Action {
  if (!input.type || typeof input.type !== "string") {
    throw new CoreError("Action type is required and must be a string");
  }
  if (input.params !== undefined && (input.params === null || typeof input.params !== "object" || Array.isArray(input.params))) {
    throw new CoreError("Action params must be an object");
  }
  return {
    type: input.type,
    id: input.id ?? "",
    timestamp: 0,
    params: input.params ?? {},
  };
}

function toSnapshot(
  path: string,
  project: ProductionDocument,
  assets: AssetIndex,
  revision: number,
  generation: number,
): DocumentSnapshot {
  const frozen = freezeProject(project);
  return {
    version: SCHEMA_VERSION,
    id: frozen.id,
    name: frozen.name,
    path,
    revision,
    settings: frozen.settings,
    project: frozen,
    assets,
    generation,
  };
}
