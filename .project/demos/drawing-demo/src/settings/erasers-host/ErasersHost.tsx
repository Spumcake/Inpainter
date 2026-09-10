import { useCallback, useEffect, useState } from 'react';
import { SettingsShell } from '../shell/SettingsShell';
import {
  documentEraserStore,
  useDocumentEraserTips,
} from '../eraser';
import { ErasersNav } from './ErasersNav';
import { EraserTipDetailPane } from './panes/EraserTipDetailPane';

type ErasersHostProps = {
  onClose: () => void;
};

function getInitialEraserActiveId(): string | null {
  const tips = documentEraserStore.getTips();
  return tips[0]?.id ?? null;
}

export function ErasersHost({ onClose }: ErasersHostProps) {
  const tips = useDocumentEraserTips();
  const [activeId, setActiveId] = useState(() => getInitialEraserActiveId());

  useEffect(() => {
    if (tips.length === 0) {
      setActiveId(null);
      return;
    }
    if (!activeId || !tips.some((tip) => tip.id === activeId)) {
      setActiveId(tips[0]!.id);
    }
  }, [tips, activeId]);

  const handleNew = useCallback(() => {
    const id = documentEraserStore.addTip();
    setActiveId(id);
  }, []);

  const handleRemove = useCallback((id: string) => {
    const removed = documentEraserStore.removeTip(id);
    if (!removed) return;
    const remaining = documentEraserStore.getTips();
    setActiveId(remaining[0]?.id ?? null);
  }, []);

  const activeTip = tips.find((tip) => tip.id === activeId) ?? null;

  return (
    <SettingsShell
      title="Erasers"
      onClose={onClose}
      nav={
        <ErasersNav
          tips={tips}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={handleNew}
        />
      }
    >
      {activeTip ? (
        <EraserTipDetailPane
          tip={activeTip}
          canRemove={tips.length > 1}
          onRemove={() => handleRemove(activeTip.id)}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-3 text-xs text-gray-400">
          No erasers yet.
        </div>
      )}
    </SettingsShell>
  );
}
