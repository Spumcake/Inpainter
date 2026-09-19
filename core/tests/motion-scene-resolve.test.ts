import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { createEmptyProject } from "../src/production/empty.ts";
import {
  findMotionKeyframe,
  findMotionLayer,
  resolveCompositionDirect,
  resolveInstanceAtTime,
  validateMotionSupport,
} from "../src/production/motion/index.ts";
import { projectFromJson, projectToJson } from "../src/production/serializer.ts";
import type { ProductionDocument } from "../src/production/types.ts";

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/production/motion-scene/project.oreel",
);

const IDS = {
  composition: "motion-1789687867150-iw8bdzf",
  bar: "motion-layer-1789687867150-2entwjc",
  headline: "motion-layer-1789687867150-yfoya39",
  instance: "motion-instance-1789687867152-u5ib3ac",
  headlineFadeOut: "motion-kf-1789687867150-lyqfobv",
} as const;

function loadFixture(): ProductionDocument {
  return projectFromJson(readFileSync(fixturePath, "utf8"));
}

function snapshot(project: ProductionDocument): string {
  return projectToJson(project);
}

function compositionRecord(project: ProductionDocument): Record<string, unknown> {
  return project.motionCompositions[0] as Record<string, unknown>;
}

function layersOf(project: ProductionDocument): Record<string, unknown>[] {
  return compositionRecord(project).layers as Record<string, unknown>[];
}

describe("motion scene resolution", () => {
  it("validates the fixture and resolves composition, instance, and ids", () => {
    const project = loadFixture();
    const before = snapshot(project);
    const scene = validateMotionSupport(project);
    expect(scene.composition.id).toBe(IDS.composition);
    expect(scene.instance.id).toBe(IDS.instance);
    expect(scene.instance.compositionId).toBe(IDS.composition);
    expect(findMotionLayer(scene.composition, IDS.bar).type).toBe("shape");
    expect(findMotionLayer(scene.composition, IDS.headline).type).toBe("text");
    expect(findMotionKeyframe(scene.composition, IDS.headlineFadeOut).time).toBe(5);
    expect(snapshot(project)).toBe(before);
  });

  it("maps half-open intervals and project time to composition time", () => {
    const project = loadFixture();
    const before = snapshot(project);

    const atZero = resolveCompositionDirect(project, 0);
    expect(atZero.layers.every((layer) => layer.active)).toBe(true);
    expect(atZero.layers.map((layer) => layer.localTime)).toEqual([0, 0]);

    const atTwo = resolveInstanceAtTime(project, 2);
    expect(atTwo.instanceActive).toBe(true);
    expect(atTwo.compositionLocalTime).toBe(2);
    expect(atTwo.layers.every((layer) => layer.active)).toBe(true);

    const lastFrame = resolveInstanceAtTime(project, 149 / 30);
    expect(lastFrame.instanceActive).toBe(true);
    expect(lastFrame.layers.every((layer) => layer.active)).toBe(true);

    const atEnd = resolveInstanceAtTime(project, 5);
    expect(atEnd.instanceActive).toBe(false);
    expect(atEnd.compositionLocalTime).toBe(5);
    expect(atEnd.layers.every((layer) => layer.active)).toBe(false);

    expect(snapshot(project)).toBe(before);
  });

  it("fails empty documents and leaves unsupported clones unchanged", () => {
    expect(() => validateMotionSupport(createEmptyProject("Empty"))).toThrow(CoreError);
    expect(() => validateMotionSupport(createEmptyProject("Empty"))).toThrow(/unsupported/i);

    const cases: Array<(project: ProductionDocument) => void> = [
      (project) => {
        project.motionCompositions = [];
      },
      (project) => {
        (project.motionInstances[0] as unknown as { compositionId: string }).compositionId = "missing";
      },
      (project) => {
        layersOf(project).push({
          id: "layer-image",
          type: "image",
          name: "Still",
          startTime: 0,
          duration: 5,
          visible: true,
          transform: layersOf(project)[0].transform,
          keyframes: [],
          assetId: "media-1",
        });
      },
      (project) => {
        layersOf(project).push({
          id: "layer-nested",
          type: "composition",
          name: "Nested",
          startTime: 0,
          duration: 5,
          visible: true,
          transform: layersOf(project)[0].transform,
          keyframes: [],
        });
      },
      (project) => {
        const style = (layersOf(project)[0].style as Record<string, unknown>);
        style.fill = { type: "shader", shaderId: "paper" };
      },
      (project) => {
        const style = layersOf(project)[0].style as Record<string, unknown>;
        style.stroke = { color: "#ff0000", width: 4, opacity: 1 };
      },
      (project) => {
        const style = layersOf(project)[0].style as Record<string, unknown>;
        style.shadow = { color: "#000000", blur: 8 };
      },
      (project) => {
        (layersOf(project)[0].keyframes as unknown[]).push({
          id: "kf-pos",
          time: 1,
          property: "transform.position.x",
          value: 10,
          easing: "linear",
        });
      },
      (project) => {
        project.motionInstances.push({
          ...(project.motionInstances[0] as unknown as Record<string, unknown>),
          id: "motion-instance-extra",
        } as unknown as ProductionDocument["motionInstances"][number]);
      },
      (project) => {
        project.mediaLibrary.items.push({ id: "clip-a" });
      },
      (project) => {
        layersOf(project)[1].id = layersOf(project)[0].id;
      },
    ];

    for (const mutate of cases) {
      const project = loadFixture();
      mutate(project);
      const afterMutation = snapshot(project);
      expect(() => validateMotionSupport(project)).toThrow(CoreError);
      expect(snapshot(project)).toBe(afterMutation);
    }
  });

  it("accepts empty headline text as an invisible text layer", () => {
    const project = loadFixture();
    const headline = layersOf(project).find((layer) => layer.id === IDS.headline);
    expect(headline).toBeDefined();
    headline!.text = "";
    const scene = validateMotionSupport(project);
    expect(findMotionLayer(scene.composition, IDS.headline)).toMatchObject({ type: "text", text: "" });
  });

  it("rejects non-finite resolve times without changing the document", () => {
    const project = loadFixture();
    const before = snapshot(project);
    expect(() => resolveInstanceAtTime(project, Number.NaN)).toThrow(/not finite/i);
    expect(() => resolveCompositionDirect(project, Number.POSITIVE_INFINITY)).toThrow(/not finite/i);
    expect(snapshot(project)).toBe(before);
  });
});
