import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  evaluateKeyframeValue,
  findMotionLayer,
  getMotionTextAnimatorRuns,
  getMotionTransformAtTime,
  validateMotionSupport,
} from "../src/production/motion/index.ts";
import { projectFromJson, projectToJson } from "../src/production/serializer.ts";
import type { MotionTextLayer } from "../src/production/motion/types.ts";
import type { ProductionDocument } from "../src/production/types.ts";

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/production/motion-scene/project.oreel",
);

const IDS = {
  bar: "motion-layer-1789687867150-2entwjc",
  headline: "motion-layer-1789687867150-yfoya39",
} as const;

function loadFixture(): ProductionDocument {
  return projectFromJson(readFileSync(fixturePath, "utf8"));
}

function easeOut(t: number): number {
  return t * (2 - t);
}

function easeIn(t: number): number {
  return t * t;
}

describe("motion scene evaluation", () => {
  it("interpolates bar scale.x and headline opacity without mutating the document", () => {
    const project = loadFixture();
    const before = projectToJson(project);
    const scene = validateMotionSupport(project);
    const bar = findMotionLayer(scene.composition, IDS.bar);
    const headline = findMotionLayer(scene.composition, IDS.headline);

    expect(evaluateKeyframeValue(bar.keyframes, "transform.scale.x", 0, bar.transform.scale.x)).toBe(0);
    expect(evaluateKeyframeValue(bar.keyframes, "transform.scale.x", 0.2, 1)).toBeCloseTo(
      easeOut(0.2 / 0.7),
      10,
    );
    expect(evaluateKeyframeValue(bar.keyframes, "transform.scale.x", 0.7, 1)).toBe(1);
    expect(evaluateKeyframeValue(bar.keyframes, "transform.scale.x", 2, 1)).toBe(1);
    expect(evaluateKeyframeValue(bar.keyframes, "transform.scale.x", 4.75, 1)).toBe(1);
    expect(evaluateKeyframeValue(bar.keyframes, "transform.scale.x", 149 / 30, 1)).toBe(1);

    expect(evaluateKeyframeValue(headline.keyframes, "transform.opacity", 0, 1)).toBe(0);
    expect(evaluateKeyframeValue(headline.keyframes, "transform.opacity", 0.6, 1)).toBe(1);
    expect(evaluateKeyframeValue(headline.keyframes, "transform.opacity", 2, 1)).toBe(1);
    expect(evaluateKeyframeValue(headline.keyframes, "transform.opacity", 4.5, 1)).toBe(1);
    expect(evaluateKeyframeValue(headline.keyframes, "transform.opacity", 4.75, 1)).toBeCloseTo(
      1 + (0 - 1) * easeIn((4.75 - 4.5) / 0.5),
      10,
    );
    expect(evaluateKeyframeValue(headline.keyframes, "transform.opacity", 5, 1)).toBe(0);

    const barAtTwo = getMotionTransformAtTime(bar.transform, bar.keyframes, 2);
    expect(barAtTwo.scale.x).toBe(1);
    expect(barAtTwo.scale.y).toBe(bar.transform.scale.y);
    expect(barAtTwo).not.toBe(bar.transform);

    expect(projectToJson(project)).toBe(before);
  });

  it("evaluates per-character reveal from serialized settings, not hardcoded text", () => {
    const project = loadFixture();
    const before = projectToJson(project);
    const scene = validateMotionSupport(project);
    const headline = findMotionLayer(scene.composition, IDS.headline) as MotionTextLayer;

    const atReveal = getMotionTextAnimatorRuns(headline, 0.2);
    expect(atReveal.map((run) => run.character).join("")).toBe(headline.text);
    const first = atReveal[0];
    const later = atReveal[7];
    expect(first?.character).toBe(headline.text[0]);
    expect(first?.opacity).toBeGreaterThan(0);
    expect(first?.opacity).toBeLessThan(1);
    expect(first?.position.y).toBeGreaterThan(0);
    expect(first?.position.y).toBeLessThan(36);
    expect(later?.opacity).toBe(0);
    expect(later?.position.y).toBe(36);
    expect(later?.scale.x).toBeCloseTo(0.96, 10);

    const settled = getMotionTextAnimatorRuns(headline, 2);
    expect(settled.every((run) => run.opacity === 1)).toBe(true);
    expect(settled.every((run) => run.position.x === 0 && run.position.y === 0)).toBe(true);
    expect(settled.every((run) => run.scale.x === 1 && run.scale.y === 1)).toBe(true);

    const renamed = { ...headline, text: "Hi" };
    const renamedRuns = getMotionTextAnimatorRuns(renamed, 0.2);
    expect(renamedRuns).toHaveLength(2);
    expect(renamedRuns.map((run) => run.character).join("")).toBe("Hi");
    expect(renamedRuns).not.toHaveLength(atReveal.length);

    expect(projectToJson(project)).toBe(before);
  });
});
