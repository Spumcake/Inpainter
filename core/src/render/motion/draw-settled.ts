import { getMotionTransformAtTime } from "../../production/motion/keyframes.ts";
import { isIntervalActive } from "../../production/motion/resolve.ts";
import type { MotionComposition, MotionLayer } from "../../production/motion/types.ts";
import type { SettledCanvas2D } from "./canvas.ts";
import { drawSettledShape } from "./draw-shape.ts";
import { drawSettledText } from "./draw-text.ts";
import { applySettledLayerTransform } from "./transform.ts";

export function drawSettledComposition(
  ctx: SettledCanvas2D,
  composition: MotionComposition,
  compositionLocalTime: number,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, composition.width, composition.height);
  if (composition.backgroundColor && composition.backgroundColor !== "transparent") {
    ctx.fillStyle = composition.backgroundColor;
    ctx.fillRect(0, 0, composition.width, composition.height);
  }
  ctx.restore();

  for (const layer of composition.layers) {
    if (layer.visible === false) continue;
    if (!isIntervalActive(compositionLocalTime, layer.startTime, layer.duration)) continue;
    const localTime = compositionLocalTime - layer.startTime;
    const transform = getMotionTransformAtTime(layer.transform, layer.keyframes, localTime);
    ctx.save();
    applySettledLayerTransform(ctx, transform);
    drawSettledLayer(ctx, layer, localTime);
    ctx.restore();
  }
}

function drawSettledLayer(ctx: SettledCanvas2D, layer: MotionLayer, localTime: number): void {
  if (layer.type === "shape") {
    drawSettledShape(ctx, layer);
    return;
  }
  drawSettledText(ctx, layer, localTime);
}
