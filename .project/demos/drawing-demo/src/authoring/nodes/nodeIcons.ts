import type { LucideIcon } from 'lucide-react';
import {
  Frame,
  Image,
  Layers,
  Paintbrush,
  SquareDashed,
  Type,
} from 'lucide-react';
import type { NodeType } from '../types/nodes';

/**
 * Per-NodeType icon — owned by the node domain.
 * Panels/chrome must call `iconForNodeType`; do not hardcode type→icon maps elsewhere.
 */
const NODE_ICONS: Record<NodeType, LucideIcon> = {
  sketch: Paintbrush,
  container: Layers,
  frame: Frame,
  image: Image,
  output: SquareDashed,
  graphText: Type,
  canvasText: Type,
};

export function iconForNodeType(type: NodeType): LucideIcon {
  return NODE_ICONS[type];
}
