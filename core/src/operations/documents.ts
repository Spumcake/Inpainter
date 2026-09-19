import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { CoreError } from "../errors.ts";
import { createEmptyProject } from "../production/empty.ts";
import { freezeProject } from "../production/freeze.ts";
import { commitFile, resolveProjectFile } from "../production/paths.ts";
import { SCHEMA_VERSION, emptyAssetIndex, parseSavePayload } from "../production/serializer.ts";
import type { AssetIndex, DocumentSnapshot, ProductionDocument } from "../production/types.ts";
import {
  nextRevision,
  persistDocumentBundle,
  recoverDocumentBundle,
  type PersistFailAfter,
} from "./documentPersist.ts";
import { assertWriterAvailable, withEphemeralWriterLock } from "./documentLock.ts";

export type { PersistFailAfter };

export function createDocument(input: {
  path: string;
  name: string;
  failAfter?: PersistFailAfter;
}): DocumentSnapshot {
  const name = input.name.trim();
  if (!name) {
    throw new CoreError("Document name is required.");
  }
  const file = resolveProjectFile(resolve(input.path.trim()));
  if (existsSync(file)) {
    throw new CoreError(`A document already exists at ${file}`);
  }
  const project = createEmptyProject(name);
  persistDocumentBundle({
    file,
    project,
    assets: emptyAssetIndex(),
    revision: 1,
    failAfter: input.failAfter,
  });
  return snapshotFromDisk(file);
}

export function openDocument(input: { path: string }): DocumentSnapshot {
  const file = resolveProjectFile(resolve(input.path.trim()));
  return snapshotFromDisk(file);
}

export function saveDocument(input: {
  path: string;
  payload: unknown;
  failAfter?: PersistFailAfter;
  expectedRevision?: number;
  lockHolder?: string;
}): DocumentSnapshot {
  const file = resolveProjectFile(resolve(input.path.trim()));
  const write = (): DocumentSnapshot => {
    const existing = existsSync(commitFile(file)) || existsSync(file);
    if (existing) {
      const onDisk = recoverDocumentBundle(file);
      if (input.expectedRevision === undefined) {
        throw new CoreError("expectedRevision is required to save an existing document");
      }
      if (onDisk.revision !== input.expectedRevision) {
        throw new CoreError(
          `Save conflict: document revision is ${onDisk.revision}, session expected ${input.expectedRevision}`,
        );
      }
      const parsed = parseSavePayload(input.payload);
      if (parsed.project.id !== onDisk.project.id) {
        throw new CoreError(`Document id cannot change: ${onDisk.project.id}`);
      }
      const assets = parsed.assets ?? onDisk.assets;
      persistDocumentBundle({
        file,
        project: parsed.project,
        assets,
        revision: nextRevision(file),
        failAfter: input.failAfter,
      });
      return snapshotFromDisk(file);
    }
    if (input.expectedRevision !== undefined && input.expectedRevision !== 0) {
      throw new CoreError(
        `Save conflict: document revision is 0, session expected ${input.expectedRevision}`,
      );
    }
    const parsed = parseSavePayload(input.payload);
    const assets = parsed.assets ?? emptyAssetIndex();
    persistDocumentBundle({
      file,
      project: parsed.project,
      assets,
      revision: nextRevision(file),
      failAfter: input.failAfter,
    });
    return snapshotFromDisk(file);
  };
  if (input.lockHolder) {
    assertWriterAvailable(file, input.lockHolder);
    return write();
  }
  return withEphemeralWriterLock(file, write);
}

function snapshotFromDisk(file: string): DocumentSnapshot {
  const bundle = recoverDocumentBundle(file);
  return snapshot(file, bundle.project, bundle.assets, bundle.revision);
}

function snapshot(
  file: string,
  project: ProductionDocument,
  assets: AssetIndex,
  revision: number,
): DocumentSnapshot {
  const frozen = freezeProject(project);
  return {
    version: SCHEMA_VERSION,
    id: frozen.id,
    name: frozen.name,
    path: file,
    revision,
    settings: frozen.settings,
    project: frozen,
    assets,
  };
}
