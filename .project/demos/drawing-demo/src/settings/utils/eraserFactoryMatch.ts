import type { EraserTip } from '../eraser/types';
import { getFactoryEraserTips } from '../factory/loadDocumentPreferencesFactory';

export function tipsMatchFactory(tips: EraserTip[]): boolean {
  const factory = getFactoryEraserTips();
  if (tips.length !== factory.length) {
    return false;
  }
  return JSON.stringify(tips) === JSON.stringify(factory);
}

export function eraserHasOverrides(tips: EraserTip[]): boolean {
  return !tipsMatchFactory(tips);
}
