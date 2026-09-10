import { UNTITLED_CANVAS_LABEL } from '../authoring/document';

export type BreadcrumbSurface = 'graph' | 'canvas';

export type BreadcrumbSegmentMode = 'rename' | 'navigate' | 'display';

export type BreadcrumbSegment = {
  id: 'document' | 'graph' | 'canvas';
  label: string;
  mode: BreadcrumbSegmentMode;
};

/**
 * Header breadcrumb segment roles from view focus.
 * Graph rename only on Graph; on Canvas Graph navigates and Canvas is an icon
 * (label kept for title / aria-label).
 */
export function breadcrumbSegments(args: {
  surface: BreadcrumbSurface;
  documentTitle: string;
  graphTitle: string;
  canvasTitle?: string | null;
}): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [
    { id: 'document', label: 'Unsorted', mode: 'display' },
  ];
  if (args.surface === 'canvas') {
    segments.push({
      id: 'canvas',
      label: args.canvasTitle?.trim() || UNTITLED_CANVAS_LABEL,
      mode: 'display',
    });
  }
  return segments;
}
