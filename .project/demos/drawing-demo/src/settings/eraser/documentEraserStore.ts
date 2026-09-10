import { useEffect, useState } from 'react';
import {
  getFactoryEraserTips,
  getNewEraserTipTemplate,
} from '../factory/loadDocumentPreferencesFactory';
import { scheduleDocumentSettingsSave } from '../documentSettingsBridge';
import { cloneTips, cloneTipsWithNewIds } from './cloneTips';
import { defaultEraserStore } from './defaultEraserStore';
import type { EraserTip } from './types';

function tipsFromDefaultTemplate(): EraserTip[] {
  const defaults = defaultEraserStore.getTips();
  const source = defaults.length > 0 ? defaults : getFactoryEraserTips();
  return cloneTipsWithNewIds(source);
}

/**
 * Owns the document eraser tip list (flat instances derived from the default template).
 * Seeded at construction so Tool Config / Erasers host are never empty before hydrate
 * (and stay usable after HMR reloads the module without re-running hydrate).
 */
class DocumentEraserStore {
  private tips: EraserTip[] = tipsFromDefaultTemplate();
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

  getTips(): EraserTip[] {
    if (this.tips.length === 0) {
      this.seedFromDefault();
    }
    return cloneTips(this.tips);
  }

  getTip(id: string): EraserTip | null {
    const tip = this.tips.find((entry) => entry.id === id);
    return tip ? { ...tip } : null;
  }

  /** Hydrate without persisting. Ensures at least one tip. */
  replaceAll(tips: EraserTip[]): void {
    if (tips.length === 0) {
      this.seedFromDefault();
      return;
    }
    this.tips = cloneTips(tips);
    this.emit();
  }

  /** Seed document tips from the effective default (hydrate / empty). */
  seedFromDefault(): void {
    this.tips = tipsFromDefaultTemplate();
    this.emit();
  }

  reorderTips(fromIndex: number, toIndex: number): void {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this.tips.length ||
      toIndex >= this.tips.length
    ) {
      return;
    }

    const next = [...this.tips];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    this.tips = next;
    this.emit();
    this.persist();
  }

  addTip(name?: string): string {
    const n = this.tips.length + 1;
    const id = `eraser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.tips = [
      ...this.tips,
      {
        id,
        name: name?.trim() || `Eraser ${n}`,
        ...getNewEraserTipTemplate(),
      },
    ];
    this.emit();
    this.persist();
    return id;
  }

  renameTip(id: string, name: string): void {
    const index = this.tips.findIndex((tip) => tip.id === id);
    if (index === -1) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = [...this.tips];
    next[index] = { ...next[index], name: trimmed };
    this.tips = next;
    this.emit();
    this.persist();
  }

  patchTip(id: string, partial: Partial<Omit<EraserTip, 'id'>>): void {
    const index = this.tips.findIndex((tip) => tip.id === id);
    if (index === -1) return;
    const next = [...this.tips];
    next[index] = { ...next[index], ...partial };
    this.tips = next;
    this.emit();
    this.persist();
  }

  /** Reset tip size from the Preferences new-tip template. */
  resetTipToDefault(id: string): void {
    const index = this.tips.findIndex((tip) => tip.id === id);
    if (index === -1) return;
    const next = [...this.tips];
    next[index] = { ...next[index], ...getNewEraserTipTemplate() };
    this.tips = next;
    this.emit();
    this.persist();
  }

  /** Returns false when the tip is missing or it is the last tip. */
  removeTip(id: string): boolean {
    if (this.tips.length <= 1) return false;
    const next = this.tips.filter((tip) => tip.id !== id);
    if (next.length === this.tips.length) return false;
    this.tips = next;
    this.emit();
    this.persist();
    return true;
  }
}

export const documentEraserStore = new DocumentEraserStore();

export function useDocumentEraserTips(): EraserTip[] {
  const [tips, setTips] = useState(() => documentEraserStore.getTips());

  useEffect(() => {
    return documentEraserStore.subscribe(() => {
      setTips(documentEraserStore.getTips());
    });
  }, []);

  return tips;
}
