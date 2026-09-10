import {
  formatOutputRatio,
  resolveOutputPreferences,
} from '../../settings/resolveOutputPreferences';
import type { DocumentState } from '../types';
import type { NodeId } from '../ids';
import { buildOutput } from './factories';
import { findOutputForOwner, isOutputOwnerNode } from './outputGeometry';
import type { OutputNode } from '../types';

/** Build a new Output for `ownerId` from Document Preferences. */
export function buildOutputForOwner(ownerId: NodeId): OutputNode {
  const prefs = resolveOutputPreferences();
  return buildOutput({
    ownerId,
    ratio: formatOutputRatio(prefs.ratio),
    resolutionWidth: prefs.defaultWidth,
    resolutionHeight: prefs.defaultHeight,
    relativeScale: 1,
  });
}

/** True when draft has no Output for this owner yet. */
export function needsOutputForOwner(
  state: DocumentState,
  ownerId: NodeId,
): boolean {
  const owner = state.nodes[ownerId];
  if (!isOutputOwnerNode(owner)) {
    return false;
  }
  return findOutputForOwner(state, ownerId) == null;
}
