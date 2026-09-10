import { useEffect, useState } from 'react';
import { scheduleDocumentSettingsSave } from '../documentSettingsBridge';
import type { ContentItem, LibraryAsset } from './types';
import { NEW_ASSET_ID } from './types';

const EMPTY_ASSETS: LibraryAsset[] = [];

function normalizeContent(item: ContentItem): ContentItem {
  return {
    ...item,
    elements: item.elements ?? [item.kind],
  };
}

function normalizeAsset(asset: LibraryAsset): LibraryAsset {
  return {
    ...asset,
    contents: asset.contents.map(normalizeContent),
  };
}

class AssetLibraryStore {
  private assets: LibraryAsset[] = [];
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private persist(): void {
    void scheduleDocumentSettingsSave();
  }

  getAssets(): LibraryAsset[] {
    return this.assets.map(normalizeAsset);
  }

  replaceAll(assets: LibraryAsset[]): void {
    this.assets = assets.map(normalizeAsset);
    this.emit();
  }

  addAsset(name: string): string {
    const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const asset: LibraryAsset = {
      id,
      name: name.trim(),
      contents: [],
    };
    this.assets = [...this.assets, asset];
    this.emit();
    this.persist();
    return id;
  }

  removeAsset(id: string): void {
    this.assets = this.assets.filter((asset) => asset.id !== id);
    this.emit();
    this.persist();
  }

  addContent(assetId: string, item: Omit<ContentItem, 'id'>): void {
    const index = this.assets.findIndex((asset) => asset.id === assetId);
    if (index === -1) return;

    const content = normalizeContent({
      id: `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...item,
    });
    const next = [...this.assets];
    next[index] = {
      ...next[index],
      contents: [...next[index].contents, content],
    };
    this.assets = next;
    this.emit();
    this.persist();
  }
}

export const assetLibraryStore = new AssetLibraryStore();

export function getInitialAssetActiveId(): string {
  const assets = assetLibraryStore.getAssets();
  return assets[0]?.id ?? NEW_ASSET_ID;
}

export function useAssetLibrary(): LibraryAsset[] {
  const [assets, setAssets] = useState<LibraryAsset[]>(
    () => assetLibraryStore.getAssets() ?? EMPTY_ASSETS,
  );

  useEffect(() => {
    setAssets(assetLibraryStore.getAssets());
    return assetLibraryStore.subscribe(() => {
      setAssets(assetLibraryStore.getAssets());
    });
  }, []);

  return assets;
}
