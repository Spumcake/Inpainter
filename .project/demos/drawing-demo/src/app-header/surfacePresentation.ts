import { SquareDashed, type LucideIcon } from 'lucide-react';

export type SurfacePresentation = {
  Icon: LucideIcon;
};

/** Canvas surface glyph — same icon as header breadcrumb Canvas segment. */
export function canvasSurfacePresentation(): SurfacePresentation {
  return { Icon: SquareDashed };
}

/** Metadata pill Edit label when navigating a Frame from Graph to its Canvas. */
export const FRAME_EDIT_ON_CANVAS_LABEL = 'Edit frame on canvas';
