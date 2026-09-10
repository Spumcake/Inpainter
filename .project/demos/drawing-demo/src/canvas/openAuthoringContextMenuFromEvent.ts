import type { MouseEvent as ReactMouseEvent } from 'react';
import { openAuthoringContextMenu } from './authoringContextMenuStore';

type WorldPoint = { x: number; y: number };

/** Suppress OS menu and open the authoring node-target menu at the pointer. */
export function openNodeContextMenuFromEvent(
  event: ReactMouseEvent,
  world: WorldPoint,
): void {
  event.preventDefault();
  event.stopPropagation();
  openAuthoringContextMenu({
    x: event.clientX,
    y: event.clientY,
    worldX: world.x,
    worldY: world.y,
    kind: 'node',
  });
}

/** Suppress OS menu and open the authoring empty-surface menu at the pointer. */
export function openSurfaceContextMenuFromEvent(
  event: ReactMouseEvent,
  world: WorldPoint,
): void {
  event.preventDefault();
  event.stopPropagation();
  openAuthoringContextMenu({
    x: event.clientX,
    y: event.clientY,
    worldX: world.x,
    worldY: world.y,
    kind: 'surface',
  });
}
