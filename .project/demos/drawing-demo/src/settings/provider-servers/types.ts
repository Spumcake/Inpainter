export type RequestCapability = {
  id: string;
  trigger: string;
  params: Record<string, unknown>;
  notes?: string;
};

export type ProviderRecord = {
  provider_id: string;
  base_url: string;
  capabilities: RequestCapability[];
};
