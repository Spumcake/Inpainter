import type { DocumentState } from '../types';
import type { CanvasId } from '../ids';
import { listContainersForCanvas } from './container';

export const UNTITLED_GROUP_LABEL = 'Untitled Group';

export function nextUntitledSketchGroupName(
  state: Pick<DocumentState, 'nodes'>,
  canvasId: CanvasId,
): string {
  const groups = listContainersForCanvas(state, canvasId);
  const names = new Set(groups.map((group) => group.name));
  if (!names.has(UNTITLED_GROUP_LABEL)) {
    return UNTITLED_GROUP_LABEL;
  }
  let index = 2;
  while (names.has(`${UNTITLED_GROUP_LABEL} ${index}`)) {
    index += 1;
  }
  return `${UNTITLED_GROUP_LABEL} ${index}`;
}
