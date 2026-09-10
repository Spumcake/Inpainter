import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { CustomPaneContext, SettingValue } from '../types';
import { SettingsPaneScroll } from '../pane/SettingsPaneScroll';

const PAD_LEFT = 28;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function readCoord(raw: SettingValue, fallback: number): number {
  return typeof raw === 'number' ? clamp01(raw) : fallback;
}

type PlotSize = { width: number; height: number };

function plotBox(size: PlotSize) {
  const plotW = Math.max(1, size.width - PAD_LEFT - PAD_RIGHT);
  const plotH = Math.max(1, size.height - PAD_TOP - PAD_BOTTOM);
  return { plotW, plotH };
}

function toSvg(x: number, y: number, size: PlotSize): { x: number; y: number } {
  const { plotW, plotH } = plotBox(size);
  return {
    x: PAD_LEFT + x * plotW,
    y: PAD_TOP + (1 - y) * plotH,
  };
}

function fromSvg(svgX: number, svgY: number, size: PlotSize): { x: number; y: number } {
  const { plotW, plotH } = plotBox(size);
  return {
    x: clamp01((svgX - PAD_LEFT) / plotW),
    y: clamp01(1 - (svgY - PAD_TOP) / plotH),
  };
}

function curvePath(cx: number, cy: number, size: PlotSize): string {
  const p0 = toSvg(0, 0, size);
  const p1 = toSvg(cx, cy, size);
  const p2 = toSvg(1, 1, size);
  return `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
}

function readSize(el: HTMLElement): PlotSize | null {
  const rect = el.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width < 1 || height < 1) return null;
  return { width, height };
}

const LABEL_HEIGHT = 22;
const LABEL_GAP = 12;
const LABEL_PAD_X = 8;

export function PressureCurvePane({ values, patch }: CustomPaneContext) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  // null until measured — avoids one-frame square viewBox flash
  const [size, setSize] = useState<PlotSize | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const next = readSize(el);
      if (!next) return;
      setSize((prev) => {
        if (prev && prev.width === next.width && prev.height === next.height) {
          return prev;
        }
        return next;
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cx = readCoord(values['stylus.pressureCurveX'], 0.5);
  const cy = readCoord(values['stylus.pressureCurveY'], 0.5);

  const setFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg || !size) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = size.width / rect.width;
      const scaleY = size.height / rect.height;
      const next = fromSvg(
        (clientX - rect.left) * scaleX,
        (clientY - rect.top) * scaleY,
        size,
      );
      patch({
        'stylus.pressureCurveX': next.x,
        'stylus.pressureCurveY': next.y,
      });
    },
    [patch, size],
  );

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromClient(event.clientX, event.clientY);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    setFromClient(event.clientX, event.clientY);
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handle = size ? toSvg(cx, cy, size) : null;
  const origin = size ? toSvg(0, 0, size) : null;
  const end = size ? toSvg(1, 1, size) : null;
  const box = size ? plotBox(size) : null;

  const labelText = `${cx.toFixed(2)}, ${cy.toFixed(2)}`;
  const labelWidth = Math.max(64, labelText.length * 7.2 + LABEL_PAD_X * 2);
  const labelX =
    size && handle
      ? Math.min(
          size.width - labelWidth / 2 - 4,
          Math.max(labelWidth / 2 + 4, handle.x),
        )
      : 0;
  const labelY =
    handle != null
      ? Math.max(LABEL_HEIGHT / 2 + 4, handle.y - LABEL_GAP - LABEL_HEIGHT / 2)
      : 0;

  return (
    <SettingsPaneScroll className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <div ref={containerRef} className="min-h-0 flex-1 w-full bg-white">
        {size && handle && origin && end && box ? (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${size.width} ${size.height}`}
            width="100%"
            height="100%"
            className="touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="img"
            aria-label="Pressure response curve"
          >
            {[0.25, 0.5, 0.75].map((t) => {
              const v = toSvg(t, 0, size);
              const h = toSvg(0, t, size);
              return (
                <g key={t}>
                  <line
                    x1={v.x}
                    y1={PAD_TOP}
                    x2={v.x}
                    y2={PAD_TOP + box.plotH}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                  />
                  <line
                    x1={PAD_LEFT}
                    y1={h.y}
                    x2={PAD_LEFT + box.plotW}
                    y2={h.y}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                  />
                </g>
              );
            })}

            <rect
              x={PAD_LEFT}
              y={PAD_TOP}
              width={box.plotW}
              height={box.plotH}
              fill="none"
              stroke="#d1d5db"
              strokeWidth={1}
            />

            <line
              x1={origin.x}
              y1={origin.y}
              x2={end.x}
              y2={end.y}
              stroke="#d1d5db"
              strokeWidth={1}
              strokeDasharray="4 3"
            />

            <path
              d={curvePath(cx, cy, size)}
              fill="none"
              stroke="#111827"
              strokeWidth={2}
              strokeLinecap="round"
            />

            <circle cx={origin.x} cy={origin.y} r={3.5} fill="#9ca3af" />
            <circle cx={end.x} cy={end.y} r={3.5} fill="#9ca3af" />

            <circle
              cx={handle.x}
              cy={handle.y}
              r={7}
              fill="#111827"
              stroke="#ffffff"
              strokeWidth={2}
              className="cursor-grab"
            />

            {dragging ? (
              <g pointerEvents="none">
                <rect
                  x={labelX - labelWidth / 2}
                  y={labelY - LABEL_HEIGHT / 2}
                  width={labelWidth}
                  height={LABEL_HEIGHT}
                  rx={6}
                  ry={6}
                  fill="#111827"
                />
                <text
                  x={labelX}
                  y={labelY + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#ffffff"
                  fontSize={11}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {labelText}
                </text>
              </g>
            ) : null}

            <text
              x={PAD_LEFT + box.plotW / 2}
              y={size.height - 8}
              textAnchor="middle"
              className="fill-gray-500"
              fontSize={11}
            >
              Pressure
            </text>
            <text
              x={12}
              y={PAD_TOP + box.plotH / 2}
              textAnchor="middle"
              className="fill-gray-500"
              fontSize={11}
              transform={`rotate(-90 12 ${PAD_TOP + box.plotH / 2})`}
            >
              Output
            </text>
          </svg>
        ) : null}
      </div>
    </SettingsPaneScroll>
  );
}
