import type { CanvasId } from '../ids';
import { setNodeVisible } from '../nodes/commands';
import type { Command } from './types';

export { setNodeVisible };

export function setCanvasName(canvasId: CanvasId, name: string): Command {
  return {
    label: 'Rename canvas',
    apply: (draft) => {
      const canvas = draft.canvases[canvasId];
      if (canvas) {
        canvas.name = name;
      }
    },
  };
}
