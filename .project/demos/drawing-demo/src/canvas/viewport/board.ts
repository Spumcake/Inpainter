// A4 landscape at 96 DPI — matches Inkscape's px page size (297mm × 210mm).
export const BOARD_WIDTH = 1123;
export const BOARD_HEIGHT = 794;
export const GRID_SIZE = 24;

/** Virtual extent for infinite canvas mode (world coords from -EXTENT to +EXTENT). */
export const INFINITE_CANVAS_EXTENT = 50_000;
export const INFINITE_CANVAS_SIZE = INFINITE_CANVAS_EXTENT * 2;
export const INFINITE_CANVAS_ORIGIN = -INFINITE_CANVAS_EXTENT;

export const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;
