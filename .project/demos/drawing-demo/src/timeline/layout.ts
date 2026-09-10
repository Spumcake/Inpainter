/** Docked timeline height (px). Always-visible bottom region in the authoring body. */
export const TIMELINE_HEIGHT = 256;

/** Width of the layers column (px). */
export const TIMELINE_LAYER_WIDTH = 310;

/** Shared height for timeline header, ruler/info row, and layer entries (matches `h-9`). */
export const TIMELINE_ROW_HEIGHT = 36;

/** Space between the tool strip and the bottom of the canvas region (above the timeline). */
export const TOOLBAR_BOTTOM_GAP = 25;

/**
 * Extra reserve below the viewport pane / scrollbars, in addition to the
 * existing scrollbar gutter. Flex-docked timeline already takes its own row,
 * so this stays 0 unless the timeline is later overlaid.
 */
export const AUTHORING_BOTTOM_RESERVE = 0;
