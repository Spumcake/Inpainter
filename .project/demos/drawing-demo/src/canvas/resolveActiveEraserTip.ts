import {
  getFactoryEraserTips,
  type FactoryEraserTip,
} from '../settings/factory/loadDocumentPreferencesFactory';
import { documentEraserStore } from '../settings/eraser/documentEraserStore';
import type { SessionState } from '../authoring/types/session';

export type ResolvedEraserTip = Pick<FactoryEraserTip, 'id' | 'name' | 'size'>;

function factoryFallbackTip(): ResolvedEraserTip {
  const tips = getFactoryEraserTips();
  return tips[0] ?? {
    id: 'eraser-medium',
    name: 'Medium',
    size: 24,
  };
}

/**
 * Resolve live erase width from Session active tip in the document tip list.
 */
export function resolveActiveEraserTip(session: SessionState): ResolvedEraserTip {
  const tips = documentEraserStore.getTips();
  if (tips.length === 0) {
    return factoryFallbackTip();
  }

  const match = session.activeEraserId
    ? tips.find((tip) => tip.id === session.activeEraserId)
    : undefined;
  return match ?? tips[0]!;
}
