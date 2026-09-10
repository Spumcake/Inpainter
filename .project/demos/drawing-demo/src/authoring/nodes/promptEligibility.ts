import type { NodeRef, NodeType } from '../types/nodes';
import type { AuthoringSurface } from './nodeCapabilities';
import { capabilitiesFor, isPromptableNodeType } from './nodeCapabilities';

export type { AuthoringSurface };

/**
 * Whether the Prompt Editor may bind this Node type on the given surface.
 * Driven by {@link NODE_CAPABILITIES} `promptSurfaces`.
 */
export function isPromptEditorEligible(
  type: NodeType,
  surface: AuthoringSurface,
): boolean {
  if (!isPromptableNodeType(type)) {
    return false;
  }
  return capabilitiesFor(type).promptSurfaces.includes(surface);
}

/** Sole selected ref that is Prompt-Editor–eligible on `surface`, else null. */
export function solePromptEditorEligibleRef(
  selection: Iterable<NodeRef> | ReadonlySet<NodeRef>,
  surface: AuthoringSurface,
): NodeRef | null {
  const refs = Array.from(selection);
  if (refs.length !== 1) {
    return null;
  }
  const ref = refs[0];
  if (!ref || !isPromptEditorEligible(ref.type, surface)) {
    return null;
  }
  return ref;
}
