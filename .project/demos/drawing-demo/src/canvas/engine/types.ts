export type CanvasPoint = {
  x: number;
  y: number;
  /** 0–1 stylus pressure when captured; omitted for mouse / legacy strokes. */
  pressure?: number;
};

export type CanvasPath = {
  paths: CanvasPoint[];
  strokeWidth: number;
  strokeColor: string;
  /** 0–1 paint opacity. Ignored for erase (mask) strokes. */
  opacity?: number;
  drawMode: boolean;
  startTimestamp?: number;
  endTimestamp?: number;
};
