import type { GraphId } from '../ids';
import type { DocumentState } from '../types';
import { framesForGraph } from '../document/selectors';

/** Default display name for the first Frame on a Graph. */
export const UNTITLED_FRAME_LABEL = 'Untitled Frame';

function untitledOrdinalLabel(base: string, index: number): string {
  return index <= 0 ? base : `${base} ${index + 1}`;
}

/**
 * Next Untitled Frame name for a Graph before insert.
 * 0 existing → `Untitled Frame`; 1 existing → `Untitled Frame 2`; …
 */
export function nextUntitledFrameName(
  state: DocumentState,
  graphId: GraphId,
): string {
  const index = framesForGraph(state, graphId).length;
  return untitledOrdinalLabel(UNTITLED_FRAME_LABEL, index);
}
