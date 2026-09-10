import type { SettingValue } from '../types';
import factory from './document-preferences.factory.json';

export type FactoryBrushPalette = {
  id: string;
  name: string;
  color: string;
  size: number;
  opacity: number;
  smoothing: number;
};

export type FactoryEraserTip = {
  id: string;
  name: string;
  size: number;
};

export type DocumentPreferencesFactory = {
  schemaVersion: number;
  extraDefaults: Record<string, SettingValue>;
  fieldDefaults: Record<string, SettingValue>;
  palette: {
    newBrushTemplate: Omit<FactoryBrushPalette, 'id' | 'name'>;
    factoryBrushes: FactoryBrushPalette[];
  };
  eraser: {
    newTipTemplate: Omit<FactoryEraserTip, 'id' | 'name'>;
    factoryTips: FactoryEraserTip[];
  };
};

const loaded = factory as DocumentPreferencesFactory;

export function getDocumentPreferencesFactory(): DocumentPreferencesFactory {
  return loaded;
}

export function getDocumentPreferencesExtraDefaults(): Record<string, SettingValue> {
  return { ...loaded.extraDefaults };
}

export function getDocumentPreferencesFieldDefault(key: string): SettingValue | undefined {
  return loaded.fieldDefaults[key];
}

export function getFactoryPaletteBrushes(): FactoryBrushPalette[] {
  return loaded.palette.factoryBrushes.map((brush) => ({ ...brush }));
}

export function getNewBrushTemplate(): Omit<FactoryBrushPalette, 'id' | 'name'> {
  return { ...loaded.palette.newBrushTemplate };
}

export function getFactoryEraserTips(): FactoryEraserTip[] {
  return loaded.eraser.factoryTips.map((tip) => ({ ...tip }));
}

export function getNewEraserTipTemplate(): Omit<FactoryEraserTip, 'id' | 'name'> {
  return { ...loaded.eraser.newTipTemplate };
}
