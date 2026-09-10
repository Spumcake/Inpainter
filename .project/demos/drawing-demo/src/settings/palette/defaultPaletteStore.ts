import { useEffect, useState } from 'react';
import {
  getFactoryPaletteBrushes,
  getNewBrushTemplate,
} from '../factory/loadDocumentPreferencesFactory';
import { scheduleDocumentSettingsSave } from '../documentSettingsBridge';
import { cloneBrushes } from './cloneBrushes';
import type { Brush } from './types';

/**
 * Owns the default/template brush list (Preferences → Palette).
 * Source for New Palette and Revert-to-default.
 */
class DefaultPaletteStore {
  private brushes: Brush[] = getFactoryPaletteBrushes().map((brush) => ({
    ...brush,
  }));
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

  getBrushes(): Brush[] {
    return cloneBrushes(this.brushes);
  }

  /** Hydrate without persisting. */
  replaceAll(brushes: Brush[]): void {
    this.brushes = cloneBrushes(brushes);
    this.emit();
  }

  reorderBrushes(fromIndex: number, toIndex: number): void {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this.brushes.length ||
      toIndex >= this.brushes.length
    ) {
      return;
    }

    const next = [...this.brushes];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    this.brushes = next;
    this.emit();
    this.persist();
  }

  addBrush(): string {
    const n = this.brushes.length + 1;
    const id = `brush-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.brushes = [
      ...this.brushes,
      { id, name: `Brush ${n}`, ...getNewBrushTemplate() },
    ];
    this.emit();
    this.persist();
    return id;
  }

  patchBrush(id: string, partial: Partial<Omit<Brush, 'id'>>): void {
    const index = this.brushes.findIndex((brush) => brush.id === id);
    if (index === -1) return;
    const next = [...this.brushes];
    next[index] = { ...next[index], ...partial };
    this.brushes = next;
    this.emit();
    this.persist();
  }

  /** Returns false when the brush is missing or it is the last brush. */
  removeBrush(id: string): boolean {
    if (this.brushes.length <= 1) return false;
    const next = this.brushes.filter((brush) => brush.id !== id);
    if (next.length === this.brushes.length) return false;
    this.brushes = next;
    this.emit();
    this.persist();
    return true;
  }

  resetToFactory(): void {
    this.brushes = getFactoryPaletteBrushes().map((brush) => ({ ...brush }));
    this.emit();
    this.persist();
  }
}

export const defaultPaletteStore = new DefaultPaletteStore();

export function useDefaultPaletteBrushes(): Brush[] {
  const [brushes, setBrushes] = useState(() => defaultPaletteStore.getBrushes());

  useEffect(() => {
    return defaultPaletteStore.subscribe(() => {
      setBrushes(defaultPaletteStore.getBrushes());
    });
  }, []);

  return brushes;
}
