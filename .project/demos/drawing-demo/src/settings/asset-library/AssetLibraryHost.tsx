import { useCallback, useState } from 'react';
import { SettingsShell } from '../shell/SettingsShell';
import { AssetLibraryNav } from './AssetLibraryNav';
import {
  assetLibraryStore,
  getInitialAssetActiveId,
  useAssetLibrary,
} from './assetLibraryStore';
import { AssetDetailPane } from './panes/AssetDetailPane';
import { NewAssetPane } from './panes/NewAssetPane';
import { NEW_ASSET_ID } from './types';

type AssetLibraryHostProps = {
  onClose: () => void;
};

export function AssetLibraryHost({ onClose }: AssetLibraryHostProps) {
  const assets = useAssetLibrary();
  const [activeId, setActiveId] = useState(() => getInitialAssetActiveId());

  const handleAdd = useCallback((name: string) => {
    const id = assetLibraryStore.addAsset(name);
    setActiveId(id);
  }, []);

  const handleRemove = useCallback(
    (id: string) => {
      assetLibraryStore.removeAsset(id);
      setActiveId(NEW_ASSET_ID);
    },
    [],
  );

  const handleAddContent = useCallback((assetId: string) => {
    console.info('[asset-library] Add Content (stub)', assetId);
    assetLibraryStore.addContent(assetId, {
      name: 'New content',
      kind: 'image',
      elements: ['image'],
    });
  }, []);

  const activeAsset = assets.find((asset) => asset.id === activeId);

  const renderPane = () => {
    if (activeId === NEW_ASSET_ID || !activeAsset) {
      return <NewAssetPane onAdd={handleAdd} />;
    }

    return (
      <AssetDetailPane
        asset={activeAsset}
        onAddContent={() => handleAddContent(activeAsset.id)}
        onRemove={() => handleRemove(activeAsset.id)}
      />
    );
  };

  return (
    <SettingsShell
      title="Asset Library"
      onClose={onClose}
      nav={
        <AssetLibraryNav
          assets={assets}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={() => setActiveId(NEW_ASSET_ID)}
        />
      }
    >
      {renderPane()}
    </SettingsShell>
  );
}
