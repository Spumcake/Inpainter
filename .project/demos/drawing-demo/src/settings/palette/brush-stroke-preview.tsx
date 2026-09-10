import { useEffect, useRef } from 'react';

type Point = { x: number; y: number };

export type BrushStrokePreviewProps = {
  color: string;
  size: number;
  opacity: number;
  className?: string;
};

const PRESSURE_AMOUNT = 0.65;
const MAX_REFERENCE_SIZE = 26;
const STEPS = 140;

function drawStroke(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  props: Pick<BrushStrokePreviewProps, 'color' | 'size' | 'opacity'>,
) {
  const p0 = { x: w * 0.02, y: h * 0.56 };
  const p3 = { x: w * 0.88, y: h * 0.48 };
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;

  const lift = h * 0.55;
  const p1 = { x: p0.x + dx * 0.32, y: p0.y + dy * 0.12 - lift };
  const p2 = { x: p0.x + dx * 0.68, y: p3.y - dy * 0.12 + lift };

  const scaledSize = props.size * ((h * 0.9) / MAX_REFERENCE_SIZE);

  const pts: Array<Point & { t: number }> = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const mt = 1 - t;
    pts.push({
      x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
      y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
      t,
    });
  }

  const left: Point[] = [];
  const right: Point[] = [];

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const ex = next.x - prev.x;
    const ey = next.y - prev.y;
    const len = Math.hypot(ex, ey) || 1;
    const nx = -ey / len;
    const ny = ex / len;
    const edgeW = Math.max(1.25, scaledSize * 0.035);
    const profile = Math.sin(Math.PI * pts[i].t);
    const half = (edgeW + (scaledSize - edgeW) * PRESSURE_AMOUNT * profile ** 0.85) / 2;
    left.push({ x: pts[i].x + nx * half, y: pts[i].y + ny * half });
    right.push({ x: pts[i].x - nx * half, y: pts[i].y - ny * half });
  }

  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = props.opacity;
  ctx.fillStyle = props.color;
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** ComfyDraw-style tapered S-curve stroke preview (canvas). */
export function BrushStrokePreview({
  color,
  size,
  opacity,
  className = 'h-full w-full',
}: BrushStrokePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const render = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStroke(ctx, width, height, { color, size, opacity });
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(container);
    return () => observer.disconnect();
  }, [color, size, opacity]);

  return (
    <div ref={containerRef} className={className} aria-hidden>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
