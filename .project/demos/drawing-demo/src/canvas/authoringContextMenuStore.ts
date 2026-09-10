export type AuthoringContextMenuKind = 'node' | 'surface';

export type AuthoringContextMenuState =
  | { open: false }
  | {
      open: true;
      /** Screen coords for menu chrome placement. */
      x: number;
      y: number;
      /** World coords at the open gesture (paste anchor). */
      worldX: number;
      worldY: number;
      kind: AuthoringContextMenuKind;
    };

let state: AuthoringContextMenuState = { open: false };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getAuthoringContextMenuSnapshot(): AuthoringContextMenuState {
  return state;
}

export function subscribeAuthoringContextMenu(
  onStoreChange: () => void,
): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function openAuthoringContextMenu(args: {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  kind: AuthoringContextMenuKind;
}): void {
  state = {
    open: true,
    x: args.x,
    y: args.y,
    worldX: args.worldX,
    worldY: args.worldY,
    kind: args.kind,
  };
  emit();
}

export function closeAuthoringContextMenu(): void {
  if (!state.open) return;
  state = { open: false };
  emit();
}
