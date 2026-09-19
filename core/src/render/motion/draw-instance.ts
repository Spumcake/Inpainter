import { isIntervalActive } from "../../production/motion/resolve.ts";
import type { MotionComposition, MotionInstance } from "../../production/motion/types.ts";
import type { SettledCanvas2D } from "./canvas.ts";
import { resolveCanvasFitDimensions } from "./canvas-fit.ts";
import { drawSettledComposition } from "./draw-settled.ts";

export type InstanceBlitCanvas = SettledCanvas2D & {
  canvas: { width: number; height: number };
};

export function fillInstanceBackground(ctx: SettledCanvas2D, width: number, height: number): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function blitCompositionOntoInstance(
  ctx: SettledCanvas2D,
  source: unknown,
  sourceWidth: number,
  sourceHeight: number,
  instance: MotionInstance,
  projectWidth: number,
  projectHeight: number,
): void {
  const transform = instance.transform;
  ctx.save();
  ctx.globalAlpha *= instance.opacity * transform.opacity;
  ctx.translate(projectWidth / 2 + transform.position.x, projectHeight / 2 + transform.position.y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale.x, transform.scale.y);
  const fitted = resolveCanvasFitDimensions(
    transform.fitMode,
    sourceWidth,
    sourceHeight,
    projectWidth,
    projectHeight,
  );
  ctx.drawImage(
    source,
    -fitted.width * transform.anchor.x,
    -fitted.height * transform.anchor.y,
    fitted.width,
    fitted.height,
  );
  ctx.restore();
}

export function drawInstanceFrame(
  projectCtx: SettledCanvas2D,
  compositionCtx: InstanceBlitCanvas,
  composition: MotionComposition,
  instance: MotionInstance,
  projectTime: number,
  projectWidth: number,
  projectHeight: number,
  trackHidden: boolean,
): void {
  fillInstanceBackground(projectCtx, projectWidth, projectHeight);
  const instanceActive =
    !trackHidden && isIntervalActive(projectTime, instance.startTime, instance.duration);
  if (!instanceActive) return;
  const localTime = Math.max(0, projectTime - instance.startTime);
  drawSettledComposition(compositionCtx, composition, localTime);
  blitCompositionOntoInstance(
    projectCtx,
    compositionCtx.canvas,
    composition.width,
    composition.height,
    instance,
    projectWidth,
    projectHeight,
  );
}
