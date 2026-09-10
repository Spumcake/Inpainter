import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Lock,
  Play,
  Plus,
  Repeat,
  SkipBack,
  SkipForward,
  Unlock,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { TIMELINE_HEIGHT, TIMELINE_LAYER_WIDTH, TIMELINE_ROW_HEIGHT } from './layout';

export const TIMELINE_CELL_WIDTH = 32;

export type TimelineLayerKind = 'drawings' | 'background';

export type TimelineDrawing = {
  id: string;
  name: string;
  frameIndex: number;
  isKey: boolean;
};

export type TimelineLayer = {
  id: string;
  kind: TimelineLayerKind;
  name: string;
  locked: boolean;
  selected: boolean;
};

type TimelineShellProps = {
  activeFrame: number;
  totalFrames: number;
  documentTitle: string;
  canvasTitle: string;
  drawings: TimelineDrawing[];
  layers: TimelineLayer[];
  onSelectFrame: (frame: number) => void;
};

const chromeLabelClass = 'text-xs font-medium text-gray-600';
const chromeTitleClass = 'text-xs font-medium text-gray-800';
const layerActionClass = 'flex h-6 w-6 items-center justify-center text-gray-400';
const layerActionClusterClass = 'flex items-center gap-0.5';
const transportButtonClass = 'flex items-center justify-center text-gray-600';
const transportCardClass = 'flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1';
const textButtonClass =
  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100';

function clampFrame(frame: number, totalFrames: number): number {
  return Math.min(totalFrames, Math.max(1, frame));
}

function formatClock(frame: number): string {
  const seconds = Math.max(0, frame - 1);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function renderRuler(totalFrames: number) {
  const cells = [];
  for (let i = 1; i <= totalFrames; i += 1) {
    cells.push(
      <div
        key={`ruler-${i}`}
        className="flex shrink-0 items-center justify-center border-r border-gray-200"
        style={{ width: TIMELINE_CELL_WIDTH }}
      >
        {i % 2 !== 0 ? (
          <span className="text-[10px] font-medium leading-none text-gray-500">
            {i}
          </span>
        ) : (
          <span className="text-[8px] leading-none text-gray-400">•</span>
        )}
      </div>,
    );
  }
  return cells;
}

function renderCells(
  layerKind: TimelineLayerKind,
  activeFrame: number,
  totalFrames: number,
  drawings: TimelineDrawing[],
  onSelectFrame: (frame: number) => void,
) {
  const cells = [];
  for (let i = 1; i <= totalFrames; i += 1) {
    const drawing = drawings.find((entry) => entry.frameIndex === i);
    const hasDrawing = drawing != null;

    let cellContent: ReactNode = null;
    const cellClass = 'relative shrink-0 border-b border-r border-gray-200';
    const cellStyle: CSSProperties = { width: TIMELINE_CELL_WIDTH };

    if (layerKind === 'drawings' && hasDrawing) {
      cellContent = (
        <div className="absolute inset-0 flex items-center justify-center p-0.5">
          <div className="flex h-full w-full items-center justify-center rounded border border-solid border-gray-400 bg-gray-100">
            <div className="h-1.5 w-1.5 rotate-45 bg-black" />
          </div>
        </div>
      );
    }

    cells.push(
      <button
        key={`cell-${layerKind}-${i}`}
        type="button"
        className={cellClass}
        style={cellStyle}
        onClick={() => onSelectFrame(i)}
      >
        {cellContent}
      </button>,
    );
  }
  return cells;
}

export function TimelineShell({
  activeFrame,
  totalFrames,
  documentTitle,
  canvasTitle,
  drawings,
  layers,
  onSelectFrame,
}: TimelineShellProps) {
  const playheadLeft = (activeFrame - 1) * TIMELINE_CELL_WIDTH + TIMELINE_CELL_WIDTH / 2;
  const trackWidth = totalFrames * TIMELINE_CELL_WIDTH;

  return (
    <div
      className="flex shrink-0 select-none flex-col border-t border-gray-200 bg-white font-sans"
      style={{ height: TIMELINE_HEIGHT }}
    >
      <div
        className="z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-2"
        style={{ height: TIMELINE_ROW_HEIGHT }}
      >
        <div className="flex items-center whitespace-nowrap text-xs font-medium text-gray-800">
          <span>{documentTitle}</span>
          <span className="mx-1.5 text-gray-300">/</span>
          <span>{canvasTitle}</span>
        </div>

        <div className="flex items-center gap-0.5">
          <div className={transportCardClass}>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className={transportButtonClass}
                onClick={() => onSelectFrame(1)}
              >
                <SkipBack size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                className={transportButtonClass}
                onClick={() => onSelectFrame(clampFrame(activeFrame - 1, totalFrames))}
              >
                <ChevronLeft size={14} strokeWidth={2} />
              </button>
              <button type="button" className={transportButtonClass}>
                <Play size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                className={transportButtonClass}
                onClick={() => onSelectFrame(clampFrame(activeFrame + 1, totalFrames))}
              >
                <ChevronRight size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                className={transportButtonClass}
                onClick={() => onSelectFrame(totalFrames)}
              >
                <SkipForward size={14} strokeWidth={2} />
              </button>
            </div>

            <div className="mx-1 h-3.5 w-px bg-gray-200" />
            <div className={chromeLabelClass}>{formatClock(activeFrame)}</div>
            <button type="button" className={transportButtonClass}>
              <Repeat size={14} strokeWidth={2} />
            </button>
          </div>

          <button type="button" className={textButtonClass}>
            {totalFrames} frames <ChevronDown size={14} strokeWidth={2.5} className="text-gray-400" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-grow overflow-hidden bg-chrome-shell">
        <div
          className="z-20 flex shrink-0 flex-col border-r border-gray-200 bg-chrome-shell"
          style={{ width: TIMELINE_LAYER_WIDTH }}
        >
          <div
            className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-2"
            style={{ height: TIMELINE_ROW_HEIGHT }}
          >
            <span className={chromeLabelClass}>Layers</span>
            <div className={layerActionClusterClass}>
              <button type="button" className={layerActionClass}>
                <Plus size={14} strokeWidth={2} />
              </button>
              <button type="button" className={layerActionClass}>
                <Eye size={14} strokeWidth={2} />
              </button>
              <button type="button" className={layerActionClass}>
                <Unlock size={14} strokeWidth={2} />
              </button>
            </div>
          </div>

          {layers.map((layer) => (
            <div
              key={layer.id}
              className={
                layer.selected
                  ? 'flex shrink-0 cursor-pointer items-center justify-between border-b border-l-[5px] border-gray-200 border-l-black bg-white px-2'
                  : 'flex shrink-0 cursor-pointer items-center justify-between border-b border-l-[5px] border-gray-200 border-l-transparent bg-white px-2 transition-colors hover:bg-gray-100'
              }
              style={{ height: TIMELINE_ROW_HEIGHT }}
            >
              <div
                className={`flex items-center gap-1.5 ${
                  layer.selected ? chromeTitleClass : chromeLabelClass
                }`}
              >
                <Layers
                  size={14}
                  strokeWidth={2}
                  className={layer.selected ? 'text-gray-800' : 'text-gray-400'}
                />
                {layer.name}
              </div>
              <div className={layerActionClusterClass}>
                <button type="button" className={layerActionClass}>
                  <Eye size={14} strokeWidth={2} />
                </button>
                <button type="button" className={layerActionClass}>
                  {layer.locked ? (
                    <Lock size={14} strokeWidth={2} />
                  ) : (
                    <Unlock size={14} strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-grow overflow-x-auto overflow-y-hidden bg-chrome-shell">
          <div className="relative" style={{ width: trackWidth }}>
            <div
              className="pointer-events-none absolute bottom-0 z-30 w-px bg-black"
              style={{
                left: playheadLeft,
                top: TIMELINE_ROW_HEIGHT,
              }}
            />

            <div
              className="flex border-b border-gray-200 bg-white"
              style={{ height: TIMELINE_ROW_HEIGHT, width: trackWidth }}
            >
              {renderRuler(totalFrames)}
            </div>
            <div
              className="flex bg-white"
              style={{ height: TIMELINE_ROW_HEIGHT, width: trackWidth }}
            >
              {renderCells('drawings', activeFrame, totalFrames, drawings, onSelectFrame)}
            </div>
            <div
              className="flex bg-white"
              style={{ height: TIMELINE_ROW_HEIGHT, width: trackWidth }}
            >
              {renderCells('background', activeFrame, totalFrames, drawings, onSelectFrame)}
            </div>
          </div>
        </div>
      </div>

      <div className="h-7 shrink-0 border-t border-gray-200 bg-white" />
    </div>
  );
}
