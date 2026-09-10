import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../../tauri-env';
import type { ProviderRecord } from './types';

const DEFAULT_SERVICE_PORT = 3100;

function normalizeProvider(raw: unknown): ProviderRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const providerId = entry.provider_id;
  const baseUrl = entry.base_url;
  const capabilitiesRaw = entry.capabilities;
  if (typeof providerId !== 'string' || typeof baseUrl !== 'string') {
    return null;
  }
  const capabilities: ProviderRecord['capabilities'] = [];
  if (Array.isArray(capabilitiesRaw)) {
    for (const cap of capabilitiesRaw) {
      if (!cap || typeof cap !== 'object' || Array.isArray(cap)) continue;
      const c = cap as Record<string, unknown>;
      if (typeof c.id !== 'string' || typeof c.trigger !== 'string') continue;
      capabilities.push({
        id: c.id,
        trigger: c.trigger,
        params:
          c.params && typeof c.params === 'object' && !Array.isArray(c.params)
            ? (c.params as Record<string, unknown>)
            : {},
        notes: typeof c.notes === 'string' ? c.notes : undefined,
      });
    }
  }
  return { provider_id: providerId, base_url: baseUrl, capabilities };
}

function normalizeProviderList(data: unknown[]): ProviderRecord[] {
  const providers: ProviderRecord[] = [];
  for (const item of data) {
    const provider = normalizeProvider(item);
    if (provider) {
      providers.push(provider);
    }
  }
  return providers;
}

export async function loadServicePort(): Promise<number> {
  if (!isTauri()) {
    return DEFAULT_SERVICE_PORT;
  }
  try {
    const payload = await invoke<{ overrides?: Record<string, unknown> }>('load_tray_settings');
    const port = payload?.overrides?.['tray.prefs.servicePort'];
    if (typeof port === 'number' && Number.isFinite(port) && port > 0) {
      return port;
    }
  } catch (err) {
    console.warn('[provider-servers] failed to load tray service port', err);
  }
  return DEFAULT_SERVICE_PORT;
}

export type FetchProvidersResult = {
  providers: ProviderRecord[];
  error?: string;
};

type FetchPipeProvidersInvokeResult = {
  providers?: unknown[];
  error?: string;
};

async function fetchViaTauriInvoke(): Promise<FetchProvidersResult> {
  try {
    const result = await invoke<FetchPipeProvidersInvokeResult>('fetch_pipe_providers');
    const raw = Array.isArray(result?.providers) ? result.providers : [];
    const providers = normalizeProviderList(raw);
    if (result?.error) {
      return { providers, error: result.error };
    }
    return { providers };
  } catch (err) {
    console.warn('[provider-servers] fetch_pipe_providers invoke failed', err);
    return {
      providers: [],
      error:
        'Pipe is unreachable. Start the backend from the tray or check Service Port in tray Preferences.',
    };
  }
}

async function fetchViaBrowser(): Promise<FetchProvidersResult> {
  const port = await loadServicePort();
  const url = `http://127.0.0.1:${port}/providers`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        providers: [],
        error: `Pipe returned ${response.status} for ${url}`,
      };
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      return { providers: [], error: 'Unexpected Pipe /providers response' };
    }
    return { providers: normalizeProviderList(data) };
  } catch (err) {
    console.warn('[provider-servers] Pipe /providers fetch failed', err);
    return {
      providers: [],
      error:
        'Pipe is unreachable. Start the backend from the tray or check Service Port in tray Preferences.',
    };
  }
}

export async function fetchRegisteredProviders(): Promise<FetchProvidersResult> {
  if (isTauri()) {
    return fetchViaTauriInvoke();
  }
  return fetchViaBrowser();
}
