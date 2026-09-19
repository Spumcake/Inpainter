import { CoreError } from "../errors.ts";

export const COMMIT_SCHEMA_VERSION = 1 as const;

export type DocumentCommit = {
  schemaVersion: 1;
  revision: number;
  documentId: string;
  document: string;
  assets: string;
  txn?: string;
};

export function commitToJson(commit: DocumentCommit): string {
  return `${JSON.stringify(commit, null, 2)}\n`;
}

export function parseCommitJson(json: string, path: string): DocumentCommit {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse error";
    throw new CoreError(`${path} is not valid JSON: ${message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CoreError(`${path} is not a valid document commit`);
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== COMMIT_SCHEMA_VERSION) {
    throw new CoreError(`${path} is not a valid document commit`);
  }
  if (typeof record.revision !== "number" || !Number.isInteger(record.revision) || record.revision < 1) {
    throw new CoreError(`${path} is missing required field revision`);
  }
  if (typeof record.documentId !== "string" || !record.documentId) {
    throw new CoreError(`${path} is missing required field documentId`);
  }
  if (typeof record.document !== "string" || !record.document) {
    throw new CoreError(`${path} is missing required field document`);
  }
  if (typeof record.assets !== "string" || !record.assets) {
    throw new CoreError(`${path} is missing required field assets`);
  }
  const txn = record.txn;
  if (txn !== undefined && (typeof txn !== "string" || !txn)) {
    throw new CoreError(`${path} is missing required field txn`);
  }
  return {
    schemaVersion: 1,
    revision: record.revision,
    documentId: record.documentId,
    document: record.document,
    assets: record.assets,
    ...(txn ? { txn } : {}),
  };
}
