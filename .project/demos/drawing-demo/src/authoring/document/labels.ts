import type { CanvasId, GraphId } from '../ids';
import type { DocumentState } from '../types';

/** Fallback when Document has no human title. */
export const UNTITLED_DOCUMENT_LABEL = 'Untitled Document';
/** Fallback when Graph has no human name (first / unfocused). */
export const UNTITLED_GRAPH_LABEL = 'Untitled Graph';
/** Fallback when Canvas has no human name (first / missing). */
export const UNTITLED_CANVAS_LABEL = 'Untitled Canvas';

function untitledOrdinalLabel(base: string, index: number): string {
  return index <= 0 ? base : `${base} ${index + 1}`;
}

/** Human-facing Document title — not the stable `documentId`. */
export function getDocumentTitle(state: DocumentState): string {
  const trimmed = state.title?.trim();
  return trimmed ? trimmed : UNTITLED_DOCUMENT_LABEL;
}

/** Human-facing Graph title for the given graph id. */
export function getGraphTitle(
  state: DocumentState,
  graphId: GraphId | null | undefined,
): string {
  if (!graphId) {
    return UNTITLED_GRAPH_LABEL;
  }

  const graph = state.graphs[graphId];
  if (!graph) {
    return UNTITLED_GRAPH_LABEL;
  }

  const trimmed = graph.name?.trim();
  if (trimmed) {
    return trimmed;
  }

  const index = state.graphOrder.indexOf(graphId);
  if (index < 0) {
    return UNTITLED_GRAPH_LABEL;
  }

  return untitledOrdinalLabel(UNTITLED_GRAPH_LABEL, index);
}

/** Human-facing Canvas title for the given canvas id (ordinal within its Graph). */
export function getCanvasTitle(
  state: DocumentState,
  canvasId: CanvasId | null | undefined,
): string {
  if (!canvasId) {
    return UNTITLED_CANVAS_LABEL;
  }

  const canvas = state.canvases[canvasId];
  if (!canvas) {
    return UNTITLED_CANVAS_LABEL;
  }

  const trimmed = canvas.name?.trim();
  if (trimmed) {
    return trimmed;
  }

  const order = state.canvasOrderByGraph[canvas.graphId] ?? [];
  const index = order.indexOf(canvasId);
  if (index < 0) {
    return UNTITLED_CANVAS_LABEL;
  }

  return untitledOrdinalLabel(UNTITLED_CANVAS_LABEL, index);
}
