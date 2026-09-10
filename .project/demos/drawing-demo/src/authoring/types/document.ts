import type { CanvasId, DocumentId, GraphId, NodeId } from '../ids';
import type { Node } from './nodes';
import type { SketchDataByCanvas } from './sketch';

export const DOCUMENT_SCHEMA_VERSION = 1 as const;

export type Graph = {
  id: GraphId;
  name?: string;
};

export type Canvas = {
  id: CanvasId;
  graphId: GraphId;
  name?: string;
  artifactIds: string[];
};

export type DocumentState = {
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  documentId: DocumentId;
  /** Human-facing title; defaults to "Untitled Document" when unset. */
  title?: string;
  indexerUrl: string | null;
  graphs: Record<GraphId, Graph>;
  graphOrder: GraphId[];
  canvases: Record<CanvasId, Canvas>;
  canvasOrderByGraph: Record<GraphId, CanvasId[]>;
  nodes: Record<NodeId, Node>;
  sketches: SketchDataByCanvas;
  /** Placeholder — wired in Phase 5 via settings adapters */
  documentSettings: null;
  /** Placeholder — wired in Phase 5 via provider prefs adapters */
  providerPrefs: null;
  /** Placeholder — wired in Phase 5 via asset library adapters */
  assetLibraryCatalog: null;
};
