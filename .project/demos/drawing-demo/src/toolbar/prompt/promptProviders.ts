import { DOCUMENT_PREFERENCES_CATALOG_ID } from '../../settings/documentSettingsBridge';
import { getDocumentPreferencesFieldDefault } from '../../settings/factory/loadDocumentPreferencesFactory';
import {
  fetchRegisteredProviders,
  type FetchProvidersResult,
} from '../../settings/provider-servers/pipeProviders';
import type { ProviderRecord } from '../../settings/provider-servers/types';
import { settingsStore } from '../../settings/store/settingsStore';

export type PromptProvidersLoad = {
  providers: ProviderRecord[];
  /** Preferred initial selection — null when the list is empty. */
  selectedId: string | null;
  error?: string;
};

/** Document Preferences default provider, else factory field default. */
export function readDefaultProviderId(): string | null {
  const snapshot = settingsStore.getSnapshot(DOCUMENT_PREFERENCES_CATALOG_ID);
  const fromDoc = snapshot['render.defaultProviderId'];
  if (typeof fromDoc === 'string' && fromDoc.trim()) {
    return fromDoc.trim();
  }
  const factory = getDocumentPreferencesFieldDefault('render.defaultProviderId');
  if (typeof factory === 'string' && factory.trim()) {
    return factory.trim();
  }
  return null;
}

/**
 * Pick chip selection: Document/factory default when connected, else first provider.
 */
export function resolvePromptProviderId(
  providers: readonly ProviderRecord[],
  preferredId: string | null = readDefaultProviderId(),
): string | null {
  if (providers.length === 0) {
    return null;
  }
  if (
    preferredId &&
    providers.some((provider) => provider.provider_id === preferredId)
  ) {
    return preferredId;
  }
  return providers[0]?.provider_id ?? null;
}

export async function loadPromptProviders(): Promise<PromptProvidersLoad> {
  const result: FetchProvidersResult = await fetchRegisteredProviders();
  return {
    providers: result.providers,
    selectedId: resolvePromptProviderId(result.providers),
    error: result.error,
  };
}
