import './paletteDomain';

export type { ConfigDomainDescriptor, ConfigDomainId } from './types';
export {
  ensureActiveToolStaging,
  getConfigDomain,
  isAnyConfigDomainStaging,
  listConfigDomains,
  registerConfigDomain,
} from './registry';
export {
  createStagingBrush,
  ensurePaintStaging,
  isPaletteStagingMode,
  materializePaintStagingToPalette,
  materializePaintStagingToPaletteSet,
} from './paletteDomain';
