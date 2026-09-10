import {
  FRAME_EDIT_ON_CANVAS_LABEL,
  canvasSurfacePresentation,
} from '../app-header/surfacePresentation';
import { editFrameOnCanvas } from '../authoring/nodes';
import {
  enterContainerEdit,
  exitContainerEdit,
} from '../authoring/session/sessionStore';
import type { AuthoringWorkspace } from '../authoring/workspace';
import type { Node, SessionState } from '../authoring/types';
import { presentationForTool } from '../toolbar/toolPresentation';
import { activateDrawTool } from '../toolbar/tools/selectTool';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, SquarePen } from 'lucide-react';

export type EditDestination = {
  Icon: LucideIcon;
  label: string;
  go: () => void;
};

export type AuthoringSurface = 'graph' | 'canvas';

export function authoringSurfaceFromViewFocus(
  viewFocus: Pick<SessionState['viewFocus'], 'canvasId'>,
): AuthoringSurface {
  return viewFocus.canvasId != null ? 'canvas' : 'graph';
}

const SKETCH_EDIT_LABEL = 'Edit with paint';
const CONTAINER_EDIT_LABEL = 'Edit group';

/**
 * Resolve metadata pill Edit for a sole selected Transformable Node.
 * Returns null when no Edit link applies (Image, Frame on Canvas, etc.).
 */
export function resolveEditDestination(
  workspace: AuthoringWorkspace,
  node: Node,
  surface: AuthoringSurface,
  session: Pick<SessionState, 'containerEditId'>,
): EditDestination | null {
  if (node.type === 'sketch' && surface === 'canvas' && session.containerEditId) {
    return null;
  }

  if (node.type === 'sketch' && surface === 'canvas' && !session.containerEditId) {
    const paint = presentationForTool('paint');
    return {
      Icon: paint.Icon,
      label: SKETCH_EDIT_LABEL,
      go: () => activateDrawTool(workspace, 'paint'),
    };
  }

  if (
    node.type === 'container' &&
    surface === 'canvas' &&
    !session.containerEditId &&
    node.memberIds.length >= 1
  ) {
    return {
      Icon: SquarePen,
      label: CONTAINER_EDIT_LABEL,
      go: () => enterContainerEdit(workspace.sessionStore, node.id),
    };
  }

  if (node.type === 'frame' && surface === 'graph') {
    const canvas = canvasSurfacePresentation();
    return {
      Icon: canvas.Icon,
      label: FRAME_EDIT_ON_CANVAS_LABEL,
      go: () => editFrameOnCanvas(workspace, node.id),
    };
  }

  return null;
}

/**
 * Container-edit Return pill when Select is latched and selection is empty.
 */
export function resolveContainerEditReturn(
  workspace: AuthoringWorkspace,
  session: Pick<SessionState, 'containerEditId' | 'selection' | 'activeTool'>,
): EditDestination | null {
  if (
    session.containerEditId == null ||
    session.activeTool !== 'select' ||
    session.selection.size > 0
  ) {
    return null;
  }
  const containerId = session.containerEditId;
  return {
    Icon: ArrowLeft,
    label: 'Return',
    go: () => exitContainerEdit(workspace.sessionStore, containerId),
  };
}

/** @deprecated Use resolveContainerEditReturn */
export const resolveGroupEditReturn = resolveContainerEditReturn;
