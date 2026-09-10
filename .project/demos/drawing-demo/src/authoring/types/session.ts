import type { CanvasId, DocumentId, GraphId, LayerId, NodeId } from '../ids';
import type { Brush } from '../../settings/palette/types';
import type { NodeRef, Rect } from './nodes';

export type ActiveTool =
  | 'select'
  | 'paint'
  | 'erase'
  | 'grab'
  | 'createSketch'
  | 'createFrame';

export type ViewFocus = {
  documentId: DocumentId | null;
  graphId: GraphId | null;
  canvasId: CanvasId | null;
};

export type ViewportState = {
  panX: number;
  panY: number;
  zoom: number;
};

/** Fields shared by SessionState and per-surface resume snapshots. */
type SurfaceResumeShared = {
  viewport: ViewportState;
  activeTool: ActiveTool;
  activeSketchId: NodeId | null;
  activeLayerId: LayerId | null;
  activePaletteId: string | null;
  activeBrushId: string | null;
  activeEraserId: string | null;
  /** Agent mode for this Graph / Canvas — restored with the surface. */
  agentMode: boolean;
  /**
   * Output–input toggle for this Graph / Canvas — restored with the surface.
   * Not Document / History.
   */
  renderResultView: 'input' | 'output';
};

/**
 * Ephemeral per-Graph / per-Canvas Session resume.
 * Mirrors Session surface fields; selection is an array for JSON-safe snapshots.
 * Not Document content; not History. Lost on quit.
 */
export type SurfaceResumeState = SurfaceResumeShared & {
  selection: NodeRef[];
};

/** Session-owned paint draft before a Sketch owns a DocumentPalette bind. */
export type PaintStaging = {
  /** Display / materialize name for the staging palette (host detail rename). */
  name: string;
  brushes: Array<Brush | null>;
  activeBrushId: string | null;
};

export type SessionState = SurfaceResumeShared & {
  viewFocus: ViewFocus;
  selection: Set<NodeRef>;
  /**
   * Private paint draft for palette config-domain staging (pre-Sketch).
   * Not DocumentSettings. Survives materialize for the window so the next create can clone again.
   */
  paintStaging: PaintStaging | null;
  eraseHeld: boolean;
  eraseToggled: boolean;
  eyedropperTargetId: string | null;
  openModal: string | null;
  clipboard: unknown | null;
  /** Per-surface resume keyed by `graph:${id}` / `canvas:${id}`. */
  surfaceResume: Record<string, SurfaceResumeState>;
  /**
   * One-shot: Canvas ViewportShell should center on this world rect and ignore
   * prior Canvas resume pan (e.g. Frame pill Edit). `zoom` is the Graph zoom to
   * preserve. Cleared after apply.
   */
  viewportFitRequest: { rect: Rect; zoom: number; token: number } | null;
  /**
   * Select Prompt Editor strip open. Session app state (not Document / History).
   * Cleared when Select leaves or the sole promptable selection is lost.
   */
  promptEditorOpen: boolean;
  /**
   * Output–input toggle: show generation inputs vs result Image Nodes.
   * Not Document / History. Default `input`.
   */
  renderResultView: 'input' | 'output';
  /**
   * Frame pill Edit focus: which Frame’s Canvas chrome (underlay + outside dim)
   * is shown. Set only by `editFrameOnCanvas`; cleared when leaving that Canvas.
   * Not Document / History. Not surface resume.
   */
  canvasFrameId: NodeId | null;
  /**
   * Container-edit mode: which Container's members are independently selectable.
   * Cleared when leaving Canvas or focus transition. Not Document / History.
   */
  containerEditId: NodeId | null;
  /**
   * True while a live gesture should defer remote Document patches
   * (stroke / transform draft). Not Document content; not History.
   */
  interactionBusy: boolean;
};
