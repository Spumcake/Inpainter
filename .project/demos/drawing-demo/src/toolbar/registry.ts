import { createFrameTool } from './tools/createFrameTool';
import { createSketchTool } from './tools/createSketchTool';
import { eraseTool } from './tools/eraseTool';
import { paintTool } from './tools/paintTool';
import { selectTool } from './tools/selectTool';
import type { ToolContribution } from './types';

/** Registry order: Graph strip resolves createFrame + select; Canvas keeps sketch/paint tools. */
export const TOOL_REGISTRY: ToolContribution[] = [
  createFrameTool,
  createSketchTool,
  selectTool,
  paintTool,
  eraseTool,
];
