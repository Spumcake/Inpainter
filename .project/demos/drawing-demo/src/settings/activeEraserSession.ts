import { setActiveEraserId, type SessionStore } from '../authoring/session';
import { documentEraserStore } from './eraser/documentEraserStore';

/**
 * Ensure Session activeEraserId points at a tip in the document tip list.
 */
export function clampSessionActiveEraserId(sessionStore: SessionStore): void {
  const tips = documentEraserStore.getTips();
  if (tips.length === 0) {
    setActiveEraserId(sessionStore, null);
    return;
  }

  const tipId = sessionStore.getState().activeEraserId;
  if (tipId && tips.some((tip) => tip.id === tipId)) {
    return;
  }

  setActiveEraserId(sessionStore, tips[0]!.id);
}
