import type { SessionStore } from '../../authoring/session/sessionStore';
import type { Node } from '../../authoring/types';
import type { ActiveTool, SessionState } from '../../authoring/types/session';

export type ConfigDomainId = 'palette';

/**
 * Descriptor for a config domain that can stage Session drafts and materialize
 * into Node-owned durable config. Register via `registerConfigDomain`.
 */
export type ConfigDomainDescriptor = {
  id: ConfigDomainId;
  /** True when this tool latches against this domain’s staging/materialize path. */
  usesDomain: (activeTool: ActiveTool) => boolean;
  /** Seed Session staging draft from Document Preferences / factory if missing. */
  ensureStaging: (sessionStore: SessionStore) => void;
  /**
   * True when Session should use this domain’s staging draft (no owning Node).
   * Pass `nodes` so dead selection refs count as staging.
   */
  isStagingMode: (
    session: SessionState,
    nodes?: Readonly<Record<string, Node>>,
  ) => boolean;
};
