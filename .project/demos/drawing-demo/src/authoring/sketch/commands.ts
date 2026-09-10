import {
  asCanvasId,
  createId,
  type CanvasId,
  type GraphId,
  type LayerId,
  type NodeId,
  type SublayerId,
} from '../ids';
import { createDefaultSketchData } from '../document/factory';
import type { StrokePoint } from '../types';
import type { Command } from '../commands/types';
import { buildLayer, buildStroke, buildSublayer } from './factories';
import {
  findLayer,
  findLayerIndex,
  findSublayer,
  findSublayerIndex,
  getSketch,
  moveArrayItem,
} from './helpers';
import { resolvePaletteSublayerForLayer } from './paletteSublayer';
import { artboardRectFromSketch } from './bounds';
import { fitSketchVisibleInkBounds } from './visibleInkBounds';
import { clearFrameWindowUrlsForCanvas } from '../nodes/clearFrameWindowUrlsForCanvas';
import { listSketchesForCanvas } from '../nodes/listSketches';

export type CommitStrokeArgs = {
  canvasId: CanvasId;
  layerId: LayerId;
  sublayerId?: SublayerId;
  points: StrokePoint[];
  attrs?: Record<string, unknown>;
  paletteId?: string;
  /** Sketch Node this stroke belongs to; also refits that Sketch's bounds. */
  sketchId?: NodeId;
};

export function createCanvasOnGraph(graphId: GraphId, name?: string): Command {
  return {
    label: 'Create canvas',
    apply: (draft) => {
      if (!draft.graphs[graphId]) {
        return;
      }

      const canvasId = asCanvasId(createId('canvas'));
      draft.canvases[canvasId] = {
        id: canvasId,
        graphId,
        name,
        artifactIds: [],
      };

      if (!draft.canvasOrderByGraph[graphId]) {
        draft.canvasOrderByGraph[graphId] = [];
      }
      draft.canvasOrderByGraph[graphId].push(canvasId);
      draft.sketches[canvasId] = createDefaultSketchData(canvasId);
    },
  };
}

export function addLayer(canvasId: CanvasId, name?: string): Command {
  return {
    label: 'Add layer',
    apply: (draft) => {
      const sketch = getSketch(draft, canvasId);
      if (!sketch) {
        return;
      }
      sketch.layers.push(buildLayer({ name }));
    },
  };
}

export function reorderLayer(
  canvasId: CanvasId,
  layerId: LayerId,
  toIndex: number,
): Command {
  return {
    label: 'Reorder layer',
    apply: (draft) => {
      const sketch = getSketch(draft, canvasId);
      if (!sketch) {
        return;
      }
      const fromIndex = findLayerIndex(sketch, layerId);
      if (fromIndex < 0) {
        return;
      }
      moveArrayItem(sketch.layers, fromIndex, toIndex);
    },
  };
}

export function setLayerVisible(
  canvasId: CanvasId,
  layerId: LayerId,
  visible: boolean,
): Command {
  return {
    label: visible ? 'Show layer' : 'Hide layer',
    apply: (draft) => {
      const sketch = getSketch(draft, canvasId);
      const layer = sketch ? findLayer(sketch, layerId) : undefined;
      if (layer) {
        layer.visible = visible;
      }
    },
  };
}

export function setLayerLocked(
  canvasId: CanvasId,
  layerId: LayerId,
  locked: boolean,
): Command {
  return {
    label: locked ? 'Lock layer' : 'Unlock layer',
    apply: (draft) => {
      const sketch = getSketch(draft, canvasId);
      const layer = sketch ? findLayer(sketch, layerId) : undefined;
      if (layer) {
        layer.locked = locked;
      }
    },
  };
}

export function addSublayer(
  canvasId: CanvasId,
  layerId: LayerId,
  paletteId?: string,
): Command {
  return {
    label: 'Add sublayer',
    apply: (draft) => {
      const sketch = getSketch(draft, canvasId);
      const layer = sketch ? findLayer(sketch, layerId) : undefined;
      if (layer) {
        layer.sublayers.push(buildSublayer({ paletteId }));
      }
    },
  };
}

export function reorderSublayer(
  canvasId: CanvasId,
  layerId: LayerId,
  sublayerId: SublayerId,
  toIndex: number,
): Command {
  return {
    label: 'Reorder sublayer',
    apply: (draft) => {
      const sketch = getSketch(draft, canvasId);
      const layer = sketch ? findLayer(sketch, layerId) : undefined;
      if (!layer) {
        return;
      }
      const fromIndex = findSublayerIndex(layer, sublayerId);
      if (fromIndex < 0) {
        return;
      }
      moveArrayItem(layer.sublayers, fromIndex, toIndex);
    },
  };
}

export function setSublayerVisible(
  canvasId: CanvasId,
  layerId: LayerId,
  sublayerId: SublayerId,
  visible: boolean,
): Command {
  return {
    label: visible ? 'Show sublayer' : 'Hide sublayer',
    apply: (draft) => {
      const sketch = getSketch(draft, canvasId);
      const layer = sketch ? findLayer(sketch, layerId) : undefined;
      const sublayer = layer ? findSublayer(layer, sublayerId) : undefined;
      if (sublayer) {
        sublayer.visible = visible;
      }
    },
  };
}

export function setSublayerLocked(
  canvasId: CanvasId,
  layerId: LayerId,
  sublayerId: SublayerId,
  locked: boolean,
): Command {
  return {
    label: locked ? 'Lock sublayer' : 'Unlock sublayer',
    apply: (draft) => {
      const sketch = getSketch(draft, canvasId);
      const layer = sketch ? findLayer(sketch, layerId) : undefined;
      const sublayer = layer ? findSublayer(layer, sublayerId) : undefined;
      if (sublayer) {
        sublayer.locked = locked;
      }
    },
  };
}

export function commitStroke(args: CommitStrokeArgs): Command {
  const isErase = args.attrs?.drawMode === false;
  return {
    label: isErase ? 'Erase stroke' : 'Commit stroke',
    apply: (draft) => {
      const sketch = getSketch(draft, args.canvasId);
      if (!sketch) {
        return;
      }
      const layer = findLayer(sketch, args.layerId);
      if (!layer) {
        return;
      }

      let sublayer;

      if (args.paletteId) {
        const resolution = resolvePaletteSublayerForLayer(layer, args.paletteId);
        if (resolution.kind === 'existing') {
          sublayer = resolution.sublayer;
        } else if (resolution.kind === 'claim') {
          sublayer = resolution.sublayer;
          sublayer.paletteId = args.paletteId;
        } else {
          sublayer = buildSublayer({ paletteId: args.paletteId });
          layer.sublayers.push(sublayer);
        }
      } else if (args.sublayerId) {
        sublayer = findSublayer(layer, args.sublayerId);
      } else {
        sublayer = layer.sublayers[0];
      }

      if (!sublayer) {
        return;
      }

      sublayer.paths.push(
        buildStroke({
          points: args.points,
          attrs: args.attrs,
          sketchId: args.sketchId,
        }),
      );

      // Live crop preview must win over a stale generation URL.
      clearFrameWindowUrlsForCanvas(draft, args.canvasId);

      if (args.sketchId) {
        const sketchNode = draft.nodes[args.sketchId];
        if (sketchNode?.type === 'sketch' && sketchNode.canvasId === args.canvasId) {
          const sketches = listSketchesForCanvas(draft, args.canvasId);
          const soleId = sketches.length === 1 ? sketches[0]!.id : null;
          const fitted = fitSketchVisibleInkBounds(
            sketch,
            args.sketchId,
            soleId,
          );
          sketchNode.canvas = fitted ?? artboardRectFromSketch(sketch);
        }
      }
    },
  };
}

export function clearSketchDrawing(canvasId: CanvasId): Command {
  return {
    label: 'Clear canvas drawing',
    apply: (draft) => {
      const sketch = getSketch(draft, canvasId);
      if (!sketch) {
        return;
      }

      for (const layer of sketch.layers) {
        layer.objects = [];
        for (const sublayer of layer.sublayers) {
          sublayer.paths = [];
          sublayer.objects = [];
        }
      }
      clearFrameWindowUrlsForCanvas(draft, canvasId);
    },
  };
}

export function resizeArtboard(
  canvasId: CanvasId,
  width: number,
  height: number,
): Command {
  const nextWidth = Math.max(1, width);
  const nextHeight = Math.max(1, height);

  return {
    label: 'Resize artboard',
    apply: (draft) => {
      const sketch = getSketch(draft, canvasId);
      if (!sketch) {
        return;
      }
      if (sketch.width === nextWidth && sketch.height === nextHeight) {
        return;
      }
      sketch.width = nextWidth;
      sketch.height = nextHeight;
    },
  };
}
