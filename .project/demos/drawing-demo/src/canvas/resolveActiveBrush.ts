import {
  getFactoryPaletteBrushes,
  type FactoryBrushPalette,
} from '../settings/factory/loadDocumentPreferencesFactory';
import { isPaletteStagingMode } from '../settings/configDomain';
import type { DocumentPalette } from '../settings/palette/types';
import type { Node } from '../authoring/types';
import type { SessionState } from '../authoring/types/session';
import { filledBrushes } from '../settings/palette/sharedSlots';

export type ResolvedBrush = Pick<
  FactoryBrushPalette,
  'id' | 'name' | 'color' | 'size' | 'opacity' | 'smoothing'
>;

function factoryFallbackBrush(): ResolvedBrush {
  const brushes = getFactoryPaletteBrushes();
  return brushes[0] ?? {
    id: 'brush-default',
    name: 'Default',
    color: '#22202a',
    size: 4,
    opacity: 1,
    smoothing: 0.5,
  };
}

function resolveFromSlots(
  slots: Array<ResolvedBrush | null>,
  activeBrushId: string | null,
): ResolvedBrush {
  const filled = slots.filter((slot): slot is ResolvedBrush => slot != null);
  if (filled.length === 0) {
    return factoryFallbackBrush();
  }
  const match = activeBrushId
    ? filled.find((brush) => brush.id === activeBrushId)
    : undefined;
  return match ?? filled[0]!;
}

/**
 * Resolve live stroke style: Session paint staging when in staging mode,
 * otherwise Session active brush within the active Sketch’s palette set.
 */
export function resolveActiveBrush(
  session: SessionState,
  sketchPalettes: DocumentPalette[] = [],
  nodes?: Readonly<Record<string, Node>>,
): ResolvedBrush {
  if (isPaletteStagingMode(session, nodes) && session.paintStaging) {
    return resolveFromSlots(
      session.paintStaging.brushes,
      session.paintStaging.activeBrushId,
    );
  }

  const palette = session.activePaletteId
    ? sketchPalettes.find((entry) => entry.id === session.activePaletteId)
    : sketchPalettes[0];
  const brushes = palette ? filledBrushes(palette.brushes) : [];
  if (brushes.length === 0) {
    return factoryFallbackBrush();
  }

  const match = session.activeBrushId
    ? brushes.find((brush) => brush.id === session.activeBrushId)
    : undefined;
  return match ?? brushes[0] ?? factoryFallbackBrush();
}
