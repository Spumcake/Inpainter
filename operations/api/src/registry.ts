import openai from "../../../providers/openai/provider.json";

type ProviderManifest = {
  id: string;
  serves: string[];
  endpoint: string;
};

const MANIFESTS: ProviderManifest[] = [openai];

export type ResolvedProvider = {
  id: string;
  endpoint: string;
};

export function lookup(endpoint: string): ResolvedProvider | null {
  for (const manifest of MANIFESTS) {
    if (manifest.serves.includes(endpoint)) {
      return { id: manifest.id, endpoint: manifest.endpoint };
    }
  }
  return null;
}
