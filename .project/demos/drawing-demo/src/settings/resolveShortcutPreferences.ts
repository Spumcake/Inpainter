import type { ContextActionId } from '../authoring/nodes/nodeCapabilities';
import type { StructuralContextActionId } from '../authoring/nodes/contextActions';
import {
  DOCUMENT_PREFERENCES_CATALOG_ID,
} from './documentSettingsBridge';
import { getDocumentPreferencesExtraDefaults } from './factory/loadDocumentPreferencesFactory';
import { settingsStore } from './store/settingsStore';
import type { SettingValue } from './types';

export type ShortcutPreferences = Record<ContextActionId, string>;

/** Structural actions that have remappable chords (Make Container is menu-only). */
export type ChordedStructuralActionId = Extract<
  StructuralContextActionId,
  'group' | 'ungroup'
>;

export type StructuralShortcutPreferences = Record<
  ChordedStructuralActionId,
  string
>;

const ACTION_KEYS: Record<ContextActionId, string> = {
  cut: 'shortcuts.cut',
  copy: 'shortcuts.copy',
  paste: 'shortcuts.paste',
  delete: 'shortcuts.delete',
  hide: 'shortcuts.hide',
  lock: 'shortcuts.lock',
};

const STRUCTURAL_ACTION_KEYS: Record<ChordedStructuralActionId, string> = {
  group: 'shortcuts.group',
  ungroup: 'shortcuts.ungroup',
};

const FALLBACK: ShortcutPreferences = {
  cut: 'Mod+X',
  copy: 'Mod+C',
  paste: 'Mod+V',
  delete: 'Delete',
  hide: 'Mod+H',
  lock: 'Mod+L',
};

const STRUCTURAL_FALLBACK: StructuralShortcutPreferences = {
  group: 'Mod+G',
  ungroup: 'Mod+Shift+G',
};

function asChord(raw: SettingValue | undefined, fallback: string): string {
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return fallback;
}

/**
 * Resolved Document Preferences shortcut chords (factory + overrides).
 */
export function resolveShortcutPreferences(): ShortcutPreferences {
  const factory = getDocumentPreferencesExtraDefaults();
  const snapshot = settingsStore.getSnapshot(DOCUMENT_PREFERENCES_CATALOG_ID);
  const prefs = {} as ShortcutPreferences;
  for (const action of Object.keys(ACTION_KEYS) as ContextActionId[]) {
    const key = ACTION_KEYS[action];
    prefs[action] = asChord(
      snapshot[key] ?? factory[key],
      FALLBACK[action],
    );
  }
  return prefs;
}

export function resolveStructuralShortcutPreferences(): StructuralShortcutPreferences {
  const factory = getDocumentPreferencesExtraDefaults();
  const snapshot = settingsStore.getSnapshot(DOCUMENT_PREFERENCES_CATALOG_ID);
  const prefs = {} as StructuralShortcutPreferences;
  for (const action of Object.keys(
    STRUCTURAL_ACTION_KEYS,
  ) as ChordedStructuralActionId[]) {
    const key = STRUCTURAL_ACTION_KEYS[action];
    prefs[action] = asChord(
      snapshot[key] ?? factory[key],
      STRUCTURAL_FALLBACK[action],
    );
  }
  return prefs;
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

/** Display label for a stored chord (`Mod` → Ctrl or ⌘). */
export function formatShortcutLabel(chord: string | undefined | null): string {
  if (chord == null || !chord.trim()) {
    return '';
  }
  const modLabel = isMacPlatform() ? '⌘' : 'Ctrl';
  const parts = chord.split('+').map((part) => {
    const p = part.trim();
    if (p === 'Mod' || p === 'mod') return modLabel;
    if (p === 'Meta' || p === 'meta') return '⌘';
    if (p === 'Ctrl' || p === 'Control') return 'Ctrl';
    if (p === 'Alt' || p === 'Option') return isMacPlatform() ? '⌥' : 'Alt';
    if (p === 'Shift') return 'Shift';
    if (p.length === 1) return p.toUpperCase();
    return p;
  });
  return isMacPlatform() ? parts.join('') : parts.join('+');
}

function normalizeKeyToken(key: string): string {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function eventKeyMatchesToken(eventKey: string, token: string): boolean {
  if (token.toLowerCase() === 'delete') {
    return eventKey === 'Delete' || eventKey === 'Backspace';
  }
  return (
    eventKey === token || eventKey.toLowerCase() === token.toLowerCase()
  );
}

/**
 * True when the keyboard event matches a stored chord (`Mod` = Meta on macOS, Ctrl elsewhere).
 */
export function eventMatchesShortcut(
  event: KeyboardEvent,
  chord: string,
): boolean {
  const parts = chord.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return false;

  let wantMod = false;
  let wantCtrl = false;
  let wantMeta = false;
  let wantAlt = false;
  let wantShift = false;
  let keyToken = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'mod') wantMod = true;
    else if (lower === 'ctrl' || lower === 'control') wantCtrl = true;
    else if (lower === 'meta' || lower === 'cmd' || lower === 'command') {
      wantMeta = true;
    } else if (lower === 'alt' || lower === 'option') wantAlt = true;
    else if (lower === 'shift') wantShift = true;
    else keyToken = normalizeKeyToken(part);
  }

  if (!keyToken) return false;

  const expectCtrl = wantCtrl || (wantMod && !isMacPlatform());
  const expectMeta = wantMeta || (wantMod && isMacPlatform());

  if (event.ctrlKey !== expectCtrl) return false;
  if (event.metaKey !== expectMeta) return false;
  if (event.altKey !== wantAlt) return false;
  if (event.shiftKey !== wantShift) return false;

  return eventKeyMatchesToken(normalizeKeyToken(event.key), keyToken);
}

/** Which context action (if any) the event matches among effective prefs. */
export function matchShortcutAction(
  event: KeyboardEvent,
  prefs: ShortcutPreferences = resolveShortcutPreferences(),
): ContextActionId | null {
  for (const action of Object.keys(prefs) as ContextActionId[]) {
    if (eventMatchesShortcut(event, prefs[action])) {
      return action;
    }
  }
  return null;
}

export function matchStructuralShortcutAction(
  event: KeyboardEvent,
  prefs: StructuralShortcutPreferences = resolveStructuralShortcutPreferences(),
): ChordedStructuralActionId | null {
  for (const action of Object.keys(prefs) as ChordedStructuralActionId[]) {
    if (eventMatchesShortcut(event, prefs[action])) {
      return action;
    }
  }
  return null;
}
