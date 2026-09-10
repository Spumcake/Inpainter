/**
 * Select / metadata chrome colors owned by Node type.
 * Consumers (Bounding-box chrome, Frame chrome, selection metadata pill) must
 * read from here — do not re-declare Sketch violet / Frame–Output black elsewhere.
 *
 * Dispatch: {@link chromeForNodeType} in `nodeCapabilities.ts`.
 */
export type NodeChrome = {
  /** Select outline + metadata pill / Prompt toggle fill. */
  outline: string;
  /** Mid-edge resize handle fill. */
  handle: string;
  /** Selected interior wash (Sketch); null = none (Frame). */
  selectedWash: string | null;
  /** Paint/erase persist outline; null when unused. */
  drawingOutline: string | null;
  /** Tailwind fill class for pill / Prompt toggle (static for JIT). */
  pillBgClass: string;
  /**
   * Inactive Prompt-toggle mute overlay (and similar sibling fades).
   * Same accent family as `outline` — not a generic black wash.
   */
  muteOverlayClass: string;
};

/** Shared Frame (Graph Select) + Output (Agent Canvas) accent. */
export const OUTPUT_ACCENT = '#000000';

/** Former Canvas Output chrome orange — PE / Prompt Compiler. Use with `.output-orange-accent`. */
export const OUTPUT_ORANGE_ACCENT = '#ff5a1f';
/** CSS class in index.css — literal #ff5a1f (same paint target as accent scrollbar). */
export const OUTPUT_ORANGE_TEXT_CLASS = 'output-orange-accent';
/** Header / trigger pressed fill while output view is active. */
export const OUTPUT_ORANGE_TRIGGER_ACTIVE_CLASS = 'output-orange-trigger-active';

export const SKETCH_CHROME: NodeChrome = {
  outline: '#a78bfa',
  handle: '#8b5cf6',
  selectedWash: 'rgba(139, 92, 246, 0.045)',
  drawingOutline: 'rgba(0, 0, 0, 0.14)',
  pillBgClass: 'bg-[#a78bfa]',
  muteOverlayClass: 'bg-[#a78bfa]/25 group-hover:bg-[#a78bfa]/10',
};

/** Frame Select chrome — same accent as Canvas Output. */
export const FRAME_CHROME: NodeChrome = {
  outline: OUTPUT_ACCENT,
  handle: OUTPUT_ACCENT,
  selectedWash: null,
  drawingOutline: null,
  pillBgClass: 'bg-black',
  muteOverlayClass: 'bg-black/25 group-hover:bg-black/10',
};

export const IMAGE_CHROME: NodeChrome = {
  outline: '#00ff04',
  handle: '#00ff04',
  selectedWash: null,
  drawingOutline: null,
  pillBgClass: 'bg-[#00ff04]',
  muteOverlayClass: 'bg-[#00ff04]/25 group-hover:bg-[#00ff04]/10',
};

/** Output framing chrome (Agent mode) — same accent as Frame. */
export const OUTPUT_CHROME: NodeChrome = {
  outline: OUTPUT_ACCENT,
  handle: OUTPUT_ACCENT,
  selectedWash: null,
  drawingOutline: null,
  pillBgClass: 'bg-black',
  muteOverlayClass: 'bg-black/25 group-hover:bg-black/10',
};

/**
 * Frame (and its result Image) Select chrome while `Frame.resultView === 'output'`.
 * Same orange as Prompt Editor / Prompt Compiler agent accent.
 */
export const FRAME_OUTPUT_CHROME: NodeChrome = {
  outline: OUTPUT_ORANGE_ACCENT,
  handle: OUTPUT_ORANGE_ACCENT,
  selectedWash: null,
  drawingOutline: null,
  pillBgClass: 'bg-[#ff5a1f]',
  muteOverlayClass: 'bg-[#ff5a1f]/25 group-hover:bg-[#ff5a1f]/10',
};
