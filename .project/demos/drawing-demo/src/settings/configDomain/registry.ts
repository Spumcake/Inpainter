import type { SessionStore } from '../../authoring/session/sessionStore';
import type { Node } from '../../authoring/types';
import type { SessionState } from '../../authoring/types/session';
import type { ConfigDomainDescriptor, ConfigDomainId } from './types';

const domains = new Map<ConfigDomainId, ConfigDomainDescriptor>();

export function registerConfigDomain(descriptor: ConfigDomainDescriptor): void {
  domains.set(descriptor.id, descriptor);
}

export function getConfigDomain(
  id: ConfigDomainId,
): ConfigDomainDescriptor | undefined {
  return domains.get(id);
}

export function listConfigDomains(): ConfigDomainDescriptor[] {
  return Array.from(domains.values());
}

/** Ensure staging for every domain used by the current active tool. */
export function ensureActiveToolStaging(sessionStore: SessionStore): void {
  const session = sessionStore.getState();
  for (const domain of domains.values()) {
    if (!domain.usesDomain(session.activeTool)) continue;
    if (!domain.isStagingMode(session)) continue;
    domain.ensureStaging(sessionStore);
  }
}

/** True when any registered domain is in staging mode for this session. */
export function isAnyConfigDomainStaging(
  session: SessionState,
  nodes?: Readonly<Record<string, Node>>,
): boolean {
  for (const domain of domains.values()) {
    if (domain.isStagingMode(session, nodes)) return true;
  }
  return false;
}
