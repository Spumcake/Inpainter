import {
  asCanvasId,
  asGraphId,
  asLayerId,
  asSublayerId,
  createId,
  type CanvasId,
  type DocumentId,
} from '../ids';
import {
  DOCUMENT_SCHEMA_VERSION,
  type DocumentState,
  type Layer,
  type SketchData,
  type Sublayer,
} from '../types';

/** Default artboard size for new Canvases (matches frame prefs factory defaults; not Frame crop prefs). */
export const DEFAULT_SKETCH_ARTBOARD_SIZE = 1024;

export type CreateEmptyDocumentArgs = {
  documentId: DocumentId;
  indexerUrl?: string | null;
};

export function createDefaultSketchData(canvasId: CanvasId): SketchData {
  const layerId = asLayerId(createId('layer'));
  const sublayerId = asSublayerId(createId('sublayer'));

  const defaultSublayer: Sublayer = {
    id: sublayerId,
    visible: true,
    locked: false,
    paths: [],
    objects: [],
  };

  const defaultLayer: Layer = {
    id: layerId,
    name: 'Sketch',
    visible: true,
    locked: false,
    objects: [],
    sublayers: [defaultSublayer],
  };

  return {
    id: canvasId,
    width: DEFAULT_SKETCH_ARTBOARD_SIZE,
    height: DEFAULT_SKETCH_ARTBOARD_SIZE,
    layers: [defaultLayer],
  };
}

export function createEmptyDocumentWorkingCopy(
  args: CreateEmptyDocumentArgs,
): DocumentState {
  const graphId = asGraphId(createId('graph'));
  const canvasId = asCanvasId(createId('canvas'));

  const state: DocumentState = {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    documentId: args.documentId,
    indexerUrl: args.indexerUrl ?? null,
    graphs: {
      [graphId]: { id: graphId },
    },
    graphOrder: [graphId],
    canvases: {
      [canvasId]: {
        id: canvasId,
        graphId,
        artifactIds: [],
      },
    },
    canvasOrderByGraph: {
      [graphId]: [canvasId],
    },
    nodes: {},
    sketches: {
      [canvasId]: createDefaultSketchData(canvasId),
    },
    documentSettings: null,
    providerPrefs: null,
    assetLibraryCatalog: null,
  };

  return state;
}
