import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname } from "node:path";

import { CoreError } from "../errors.ts";
import { commitToJson, parseCommitJson, type DocumentCommit } from "../production/commit.ts";
import {
  assetIndexFile,
  assetIndexStageFile,
  commitFile,
  documentStageFile,
  legacyAssetIndexFile,
  PROJECT_FILENAME,
} from "../production/paths.ts";
import {
  assetIndexToJson,
  documentReferencesMedia,
  emptyAssetIndex,
  parseAssetIndexJson,
  projectFromJson,
  projectToJson,
} from "../production/serializer.ts";
import type { AssetIndex, ProductionDocument } from "../production/types.ts";

export type PersistFailAfter = "document" | "index" | "promote-document";

export type PersistedBundle = {
  project: ProductionDocument;
  assets: AssetIndex;
  revision: number;
};

export function persistDocumentBundle(input: {
  file: string;
  project: ProductionDocument;
  assets: AssetIndex;
  revision: number;
  failAfter?: PersistFailAfter;
}): void {
  const file = input.file;
  const parent = dirname(file);
  mkdirSync(parent, { recursive: true });
  const docStage = documentStageFile(file);
  const indexStage = assetIndexStageFile(file);
  const txn = randomUUID();
  writeFileSync(docStage, projectToJson(input.project));
  writeTxnSidecar(docStage, txn);
  if (input.failAfter === "document") {
    throw new CoreError("injected failure after document stage");
  }
  writeFileSync(indexStage, assetIndexToJson(input.assets));
  writeTxnSidecar(indexStage, txn);
  if (input.failAfter === "index") {
    throw new CoreError("injected failure after index stage");
  }
  const commit: DocumentCommit = {
    schemaVersion: 1,
    revision: input.revision,
    documentId: input.project.id,
    document: basename(file) || PROJECT_FILENAME,
    assets: basename(assetIndexFile(file)),
    txn,
  };
  writeJsonAtomic(commitFile(file), commitToJson(commit));
  promoteStage(docStage, file, () => projectFromJson(readFileSync(docStage, "utf8")));
  if (input.failAfter === "promote-document") {
    throw new CoreError("injected failure after document promote");
  }
  promoteStage(indexStage, assetIndexFile(file), () =>
    parseAssetIndexJson(readFileSync(indexStage, "utf8"), indexStage),
  );
}

export function recoverDocumentBundle(file: string): PersistedBundle {
  const commitPath = commitFile(file);
  if (existsSync(commitPath)) {
    const commit = parseCommitJson(readFileSync(commitPath, "utf8"), commitPath);
    promoteCoveredStage(file, documentStageFile(file), file, commit, (stage) => {
      projectFromJson(readFileSync(stage, "utf8"));
    });
    promoteCoveredStage(file, assetIndexStageFile(file), assetIndexFile(file), commit, (stage) => {
      parseAssetIndexJson(readFileSync(stage, "utf8"), stage);
    });
  }
  if (!existsSync(file)) {
    const docStage = documentStageFile(file);
    const indexStage = assetIndexStageFile(file);
    if (existsSync(docStage) || existsSync(indexStage)) {
      throw new CoreError(
        `Document not found: ${file}. An incomplete save left staged files; no complete document is available.`,
      );
    }
    throw new CoreError(`Document not found: ${file}`);
  }
  const project = projectFromJson(readFileSync(file, "utf8"));
  const assets = readLiveAssetIndex(file, project);
  return {
    project,
    assets,
    revision: readRevision(file),
  };
}

export function nextRevision(file: string): number {
  return currentRevision(file) + 1;
}

export function currentRevision(file: string): number {
  return readRevision(file);
}

function readRevision(file: string): number {
  const commitPath = commitFile(file);
  if (existsSync(commitPath)) {
    return parseCommitJson(readFileSync(commitPath, "utf8"), commitPath).revision;
  }
  if (existsSync(file)) {
    return 1;
  }
  return 0;
}

function promoteCoveredStage(
  file: string,
  stage: string,
  live: string,
  commit: DocumentCommit,
  parse: (stage: string) => void,
): void {
  if (!existsSync(stage)) {
    return;
  }
  if (!stageBelongsToCommit(file, stage, commit)) {
    return;
  }
  try {
    parse(stage);
  } catch {
    return;
  }
  promoteStage(stage, live, parse);
}

function stageBelongsToCommit(file: string, stage: string, commit: DocumentCommit): boolean {
  const sidecar = txnSidecar(stage);
  if (commit.txn) {
    if (!existsSync(sidecar)) {
      return false;
    }
    return readFileSync(sidecar, "utf8").trim() === commit.txn;
  }
  const commitPath = commitFile(file);
  if (!existsSync(commitPath)) {
    return false;
  }
  return statSync(commitPath).mtimeMs >= statSync(stage).mtimeMs;
}

function promoteStage(stage: string, live: string, parse: (stage: string) => void): void {
  parse(stage);
  renameSync(stage, live);
  const sidecar = txnSidecar(stage);
  if (existsSync(sidecar)) {
    unlinkSync(sidecar);
  }
}

function writeTxnSidecar(stage: string, txn: string): void {
  writeFileSync(txnSidecar(stage), `${txn}\n`);
}

function txnSidecar(stage: string): string {
  return `${stage}.txn`;
}

function readLiveAssetIndex(file: string, project: ProductionDocument): AssetIndex {
  const primary = assetIndexFile(file);
  if (existsSync(primary)) {
    return parseAssetIndexJson(readFileSync(primary, "utf8"), primary);
  }
  const legacy = legacyAssetIndexFile(file);
  if (existsSync(legacy)) {
    return parseAssetIndexJson(readFileSync(legacy, "utf8"), legacy);
  }
  if (documentReferencesMedia(project)) {
    throw new CoreError(`Asset index is missing for ${file}`);
  }
  return emptyAssetIndex();
}

function writeJsonAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, contents);
  try {
    renameSync(temporary, path);
  } catch (error) {
    throw new CoreError(`failed to write ${path}: ${error}`);
  }
}
