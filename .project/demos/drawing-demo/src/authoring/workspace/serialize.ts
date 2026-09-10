import type { DocumentId, NodeId } from '../ids';
import {
  DOCUMENT_SCHEMA_VERSION,
  normalizeLegacyNode,
  type DocumentState,
} from '../types';

/** Dev/local blob format until Indexer Document APIs exist. */
export function serializeDocument(state: DocumentState): string {
  return JSON.stringify(state);
}

export function deserializeDocument(raw: string): DocumentState {
  const parsed = JSON.parse(raw) as DocumentState;

  if (parsed.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported document schemaVersion: ${String(parsed.schemaVersion)} (expected ${DOCUMENT_SCHEMA_VERSION})`,
    );
  }

  const nodes: DocumentState['nodes'] = {};
  for (const [id, node] of Object.entries(parsed.nodes ?? {})) {
    nodes[id as NodeId] = normalizeLegacyNode(node);
  }
  parsed.nodes = nodes;

  return parsed;
}

export function documentPersistenceKey(
  indexerUrl: string | null,
  documentId: DocumentId,
): string {
  const workspace = indexerUrl ?? 'local';
  return `inpainter.authoring.v${DOCUMENT_SCHEMA_VERSION}:${workspace}:${documentId}`;
}
