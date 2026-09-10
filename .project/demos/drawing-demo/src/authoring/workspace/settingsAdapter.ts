import {
  getDocumentIdentity,
  hydrateDocumentSettings,
} from '../../settings/documentSettingsBridge';
import { clampSessionActiveEraserId } from '../../settings/activeEraserSession';
import { clampSessionActivePaletteId } from '../../settings/activePaletteSession';
import { repairSketchPaletteBinds } from '../nodes/repairSketchPaletteBinds';
import type { AuthoringWorkspace } from './types';

export async function syncDocumentSettingsIdentity(
  workspace: AuthoringWorkspace,
): Promise<void> {
  const state = workspace.documentStore.getState();
  const { legacyPalettes } = await hydrateDocumentSettings(
    state.indexerUrl,
    state.documentId,
  );
  repairSketchPaletteBinds(workspace.documentStore, legacyPalettes);
  clampSessionActivePaletteId(workspace);
  clampSessionActiveEraserId(workspace.sessionStore);

  const focused = workspace.getFocusedCanvasId();
  if (focused && state.canvases[focused]) {
    workspace.focusCanvas(focused);
  } else {
    // Stale focus (e.g. after Indexer hydrate replaced graph/canvas ids) → re-resolve.
    workspace.focusDocumentRoot();
  }
}

export function getSyncedDocumentIdentity(): {
  indexerUrl: string | null;
  documentId: string;
} {
  return getDocumentIdentity();
}
