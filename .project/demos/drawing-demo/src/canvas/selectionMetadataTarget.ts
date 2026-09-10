import type { DocumentState, Node, SessionState } from '../authoring/types';
import type { NodeRef } from '../authoring/types/nodes';
import { nodeOnSurface } from '../authoring/document/nodeOnSurface';
import { groupIdForSketch } from '../authoring/nodes/container';

/**
 * Sole selected Sketch / Frame / Image when Select metadata chrome may show.
 * Works on Canvas and Graph. Gated by chrome live (not canvasId-only).
 */
export function resolveSelectionMetadataTarget(
  session: Pick<
    SessionState,
    'activeTool' | 'selection' | 'viewFocus' | 'containerEditId'
  > & {
    agentMode?: boolean;
  },
  document: Pick<DocumentState, 'nodes' | 'canvasOrderByGraph'>,
  chromeLive: boolean,
): NodeRef | null {
  const agentMode = session.agentMode ?? false;
  if (!chromeLive || (!agentMode && session.activeTool !== 'select')) {
    return null;
  }

  const refs = Array.from(session.selection);
  if (refs.length !== 1) {
    return null;
  }
  const ref = refs[0]!;
  const node = document.nodes[ref.id] as Node | undefined;
  if (!node || node.type !== ref.type) {
    return null;
  }

  if (
    ref.type !== 'sketch' &&
    ref.type !== 'container' &&
    ref.type !== 'frame' &&
    ref.type !== 'image'
  ) {
    return null;
  }

  if (
    ref.type === 'sketch' &&
    session.containerEditId != null &&
    session.containerEditId !== groupIdForSketch(document as DocumentState, ref.id)
  ) {
    return null;
  }

  if (
    ref.type === 'container' &&
    session.containerEditId != null &&
    session.containerEditId !== ref.id
  ) {
    return null;
  }

  if (!nodeOnSurface(node, session.viewFocus, document as DocumentState)) {
    return null;
  }

  return { type: ref.type, id: ref.id };
}
