import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { AuthoringWorkspace } from '../authoring/workspace';
import {
  formatShortcutLabel,
  resolveShortcutPreferences,
  resolveStructuralShortcutPreferences,
} from '../settings/resolveShortcutPreferences';
import type { ContextActionId } from '../authoring/nodes/nodeCapabilities';
import {
  closeAuthoringContextMenu,
  getAuthoringContextMenuSnapshot,
  subscribeAuthoringContextMenu,
} from './authoringContextMenuStore';
import {
  dispatchContextMenuAction,
  resolveAuthoringContextMenuRows,
  type MenuActionId,
} from './dispatchContextMenuAction';

type AuthoringContextMenuHostProps = {
  workspace: AuthoringWorkspace;
};

/**
 * Presentational right-click context menu (black / white, shortcut column).
 * Not a ChromeMode Owner — dismiss via outside pointer / Escape / item choose.
 *
 * Activate items on pointerdown (not click): WebKitGTK / Electron often lose
 * the click after a capture-phase outside dismiss listener.
 */
export function AuthoringContextMenuHost({
  workspace,
}: AuthoringContextMenuHostProps) {
  const menu = useSyncExternalStore(
    subscribeAuthoringContextMenu,
    getAuthoringContextMenuSnapshot,
    getAuthoringContextMenuSnapshot,
  );
  const menuRef = useRef<HTMLDivElement | null>(null);

  useSyncExternalStore(
    (onStoreChange) => workspace.sessionStore.subscribe(onStoreChange),
    () => workspace.sessionStore.getState(),
    () => workspace.sessionStore.getState(),
  );
  useSyncExternalStore(
    (onStoreChange) => workspace.documentStore.subscribe(onStoreChange),
    () => workspace.documentStore.getState(),
    () => workspace.documentStore.getState(),
  );

  useEffect(() => {
    if (!menu.open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAuthoringContextMenu();
      }
    };

    const eventPathIncludesMenu = (event: Event): boolean => {
      const root = menuRef.current;
      if (!root) return false;
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      if (path.includes(root)) return true;
      const target = event.target;
      return target instanceof Node && root.contains(target);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (eventPathIncludesMenu(event)) {
        return;
      }
      closeAuthoringContextMenu();
      if (event.button === 0) {
        event.stopPropagation();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [menu.open]);

  if (!menu.open) {
    return null;
  }

  const model = resolveAuthoringContextMenuRows(workspace, menu.kind);
  const shortcuts = resolveShortcutPreferences();
  const structuralShortcuts = resolveStructuralShortcutPreferences();

  const renderRow = (
    action: MenuActionId,
    label: string,
    enabled: boolean,
    dividerBefore?: boolean,
  ) => {
    const shortcutLabel =
      action === 'group' || action === 'ungroup'
        ? structuralShortcuts[action]
        : action === 'makeContainer'
          ? ''
          : shortcuts[action as ContextActionId];
    return (
    <li key={action}>
      {dividerBefore ? (
        <div className="my-1 border-t border-white/15" role="separator" />
      ) : null}
      <button
        type="button"
        role="menuitem"
        disabled={!enabled}
        className={`flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-xs transition-colors ${
          enabled
            ? 'text-white hover:bg-white/10'
            : 'cursor-default text-white/35'
        }`}
        onPointerDown={(event) => {
          if (!enabled || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          dispatchContextMenuAction(workspace, action, menu.kind, {
            pasteAt: { x: menu.worldX, y: menu.worldY },
          });
          closeAuthoringContextMenu();
        }}
      >
        <span className="truncate font-normal">{label}</span>
        <span className="shrink-0 text-white/50">
          {formatShortcutLabel(shortcutLabel)}
        </span>
      </button>
    </li>
    );
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[100] min-w-[180px] overflow-hidden rounded-lg border border-white/20 bg-black py-1"
      style={{ top: menu.y, left: menu.x }}
    >
      <ol>
        {model.rows.map((row) =>
          renderRow(row.action, row.label, row.enabled),
        )}
        {model.structural.map((row) =>
          renderRow(row.action, row.label, row.enabled, row.dividerBefore),
        )}
      </ol>
    </div>
  );
}
