import type { MotionTransform2D } from "../../production/motion/types.ts";
import type { SettledCanvas2D } from "./canvas.ts";

export function applySettledLayerTransform(ctx: SettledCanvas2D, transform: MotionTransform2D): void {
  ctx.translate(transform.position.x, transform.position.y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale.x, transform.scale.y);
  ctx.translate(-transform.anchor.x, -transform.anchor.y);
  ctx.globalAlpha *= transform.opacity;
}
