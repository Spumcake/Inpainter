import { useEffect, useState } from 'react';
import {
  getFactoryEraserTips,
  getNewEraserTipTemplate,
} from '../factory/loadDocumentPreferencesFactory';
import { scheduleDocumentSettingsSave } from '../documentSettingsBridge';
import { cloneTips } from './cloneTips';
import type { EraserTip } from './types';

/**
 * Owns the default/template eraser tip list (Preferences → Eraser).
 * Source for New Eraser and Revert-to-default.
 */
class DefaultEraserStore {
  private tips: EraserTip[] = getFactoryEraserTips().map((tip) => ({ ...tip }));
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
    return cloneTips(this.tips);
  }

  /** Hydrate without persisting. */
  replaceAll(tips: EraserTip[]): void {
    this.tips = cloneTips(tips);
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

  addTip(): string {
    const n = this.tips.length + 1;
    const id = `eraser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.tips = [
      ...this.tips,
      { id, name: `Eraser ${n}`, ...getNewEraserTipTemplate() },
    ];
    this.emit();
    this.persist();
    return id;
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

  resetToFactory(): void {
    this.tips = getFactoryEraserTips().map((tip) => ({ ...tip }));
    this.emit();
    this.persist();
  }
}

export const defaultEraserStore = new DefaultEraserStore();

export function useDefaultEraserTips(): EraserTip[] {
  const [tips, setTips] = useState(() => defaultEraserStore.getTips());

  useEffect(() => {
    return defaultEraserStore.subscribe(() => {
      setTips(defaultEraserStore.getTips());
    });
  }, []);

  return tips;
}
