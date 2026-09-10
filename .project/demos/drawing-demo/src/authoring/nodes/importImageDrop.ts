import type { ActiveTool } from '../types/session';

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'svg',
]);

/** Longest side of placed Image rect (world units). */
export const IMAGE_DROP_MAX_SIDE = 1024;

export function canAcceptImageFileDrop(args: {
  activeTool: ActiveTool;
  chromeLive: boolean;
}): boolean {
  return args.chromeLive && args.activeTool === 'select';
}

export function isImageDropPath(path: string): boolean {
  const base = path.split(/[/\\]/).pop() ?? path;
  const ext = base.split('.').pop()?.toLowerCase();
  return ext != null && IMAGE_EXTENSIONS.has(ext);
}

export function firstImagePath(paths: readonly string[]): string | null {
  return paths.find(isImageDropPath) ?? null;
}

export function cappedImageSize(
  naturalWidth: number,
  naturalHeight: number,
  maxSide: number = IMAGE_DROP_MAX_SIDE,
): { width: number; height: number } {
  const w = Math.max(1, naturalWidth);
  const h = Math.max(1, naturalHeight);
  const longest = Math.max(w, h);
  if (longest <= maxSide) {
    return { width: w, height: h };
  }
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export function readImageNaturalSizeFromSrc(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      resolve({ width: Math.max(1, width), height: Math.max(1, height) });
    };
    img.onerror = () => {
      reject(new Error('Failed to decode image'));
    };
    img.src = src;
  });
}
