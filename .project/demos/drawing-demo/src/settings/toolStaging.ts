/**
 * Compatibility surface for palette config-domain staging.
 * Prefer importing from `./configDomain` for new code.
 */
export {
  createStagingBrush,
  ensureActiveToolStaging as ensureToolStaging,
  ensurePaintStaging,
  isPaletteStagingMode as isToolStagingMode,
  materializePaintStagingToPalette,
  materializePaintStagingToPaletteSet,
} from './configDomain';
