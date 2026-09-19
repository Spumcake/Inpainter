import type { MotionShapeLayer } from "../../production/motion/types.ts";
import type { SettledCanvas2D } from "./canvas.ts";

export function drawSettledShape(ctx: SettledCanvas2D, layer: MotionShapeLayer): void {
  const width = Math.max(0, layer.width);
  const height = Math.max(0, layer.height);
  const x = -width / 2;
  const y = -height / 2;
  const radius = Math.max(0, layer.style.cornerRadius ?? 0);

  ctx.beginPath();
  if (radius > 0) {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.roundRect(x, y, width, height, 0);
  }

  const fill = layer.style.fill;
  if (fill.type === "solid" && fill.opacity > 0) {
    ctx.save();
    ctx.globalAlpha *= fill.opacity;
    ctx.fillStyle = fill.color;
    ctx.fill();
    ctx.restore();
  }
}
