import {
  getMotionTextAnimatorRuns,
  hasEnabledMotionTextAnimators,
  splitTextRunsIntoLines,
  type MotionTextGlyphRun,
} from "../../production/motion/text-animators.ts";
import type { MotionTextLayer } from "../../production/motion/types.ts";
import type { SettledCanvas2D } from "./canvas.ts";
import { wrapMotionTextLines } from "./text-wrap.ts";

function styleNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function styleString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function getMotionTextLineHeight(layer: MotionTextLayer): number {
  return layer.style.fontSize * styleNumber(layer.style.lineHeight, 1.1);
}

export function getMotionTextBlockTop(blockHeight: number, verticalAlign: string): number {
  if (verticalAlign === "top") return 0;
  if (verticalAlign === "bottom") return -blockHeight;
  return -blockHeight / 2;
}

function getTextLineStartX(width: number, align: string): number {
  if (align === "left" || align === "start") return 0;
  if (align === "right" || align === "end") return -width;
  return -width / 2;
}

export function configureSettledTextContext(ctx: SettledCanvas2D, layer: MotionTextLayer): void {
  const fontWeight = layer.style.fontWeight ?? 700;
  ctx.fillStyle = layer.style.color;
  ctx.textBaseline = "middle";
  ctx.font = `${fontWeight} ${layer.style.fontSize}px ${layer.style.fontFamily}, Inter, sans-serif`;
}

function measureLineWidth(ctx: SettledCanvas2D, line: string, letterSpacing: number): number {
  const characters = [...line];
  return characters.reduce((width, character, index) => {
    return (
      width +
      ctx.measureText(character).width +
      (index < characters.length - 1 ? letterSpacing : 0)
    );
  }, 0);
}

export function drawSettledText(
  ctx: SettledCanvas2D,
  layer: MotionTextLayer,
  localTime = 0,
): void {
  configureSettledTextContext(ctx, layer);
  const letterSpacing = styleNumber(layer.style.letterSpacing, 0);
  const align = styleString(layer.style.align, "center");
  const verticalAlign = styleString(layer.style.verticalAlign, "middle");
  const lineHeight = getMotionTextLineHeight(layer);
  ctx.textAlign = "center";
  ctx.fillStyle = layer.style.color;

  if (hasEnabledMotionTextAnimators(layer)) {
    drawAnimatedText(ctx, layer, localTime, letterSpacing, align, verticalAlign, lineHeight);
    return;
  }

  const maxWidth = styleNumber(layer.style.maxWidth, 0);
  const lines = wrapMotionTextLines(layer.text, maxWidth, (text) => ctx.measureText(text).width);
  const blockHeight = lines.length * lineHeight;
  const blockTop = getMotionTextBlockTop(blockHeight, verticalAlign);
  const startY = blockTop + lineHeight / 2;

  lines.forEach((line, lineIndex) => {
    const width = measureLineWidth(ctx, line, letterSpacing);
    let cursorX = getTextLineStartX(width, align);
    const y = startY + lineIndex * lineHeight;
    for (const character of [...line]) {
      const characterWidth = ctx.measureText(character).width;
      const characterCenterX = cursorX + characterWidth / 2;
      cursorX += characterWidth + letterSpacing;
      if (character === " ") continue;
      ctx.save();
      ctx.translate(characterCenterX, y);
      ctx.fillText(character, 0, 0);
      ctx.restore();
    }
  });
}

function drawAnimatedText(
  ctx: SettledCanvas2D,
  layer: MotionTextLayer,
  localTime: number,
  letterSpacing: number,
  align: string,
  verticalAlign: string,
  lineHeight: number,
): void {
  const lines = splitTextRunsIntoLines(getMotionTextAnimatorRuns(layer, localTime));
  const blockHeight = lines.length * lineHeight;
  const blockTop = getMotionTextBlockTop(blockHeight, verticalAlign);
  const startY = blockTop + lineHeight / 2;

  lines.forEach((line, lineIndex) => {
    const width = measureRunLineWidth(ctx, line, letterSpacing);
    let cursorX = getTextLineStartX(width, align);
    const y = startY + lineIndex * lineHeight;
    for (const run of line) {
      const characterWidth = ctx.measureText(run.character).width;
      const characterCenterX = cursorX + characterWidth / 2;
      cursorX += characterWidth + letterSpacing;
      if (run.character === " ") continue;
      ctx.save();
      ctx.translate(characterCenterX + run.position.x, y + run.position.y);
      ctx.rotate((run.rotation * Math.PI) / 180);
      ctx.scale(run.scale.x, run.scale.y);
      ctx.globalAlpha *= run.opacity;
      ctx.fillText(run.character, 0, 0);
      ctx.restore();
    }
  });
}

function measureRunLineWidth(
  ctx: SettledCanvas2D,
  line: readonly MotionTextGlyphRun[],
  letterSpacing: number,
): number {
  return line.reduce((width, run, index) => {
    return width + ctx.measureText(run.character).width + (index < line.length - 1 ? letterSpacing : 0);
  }, 0);
}
