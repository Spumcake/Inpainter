import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../tauri-env';
import type { ResizeDirection } from './hitBands';

export function startResize(direction: ResizeDirection): void {
  if (!isTauri()) return;
  void getCurrentWindow().startResizeDragging(direction);
}

export function startMove(): void {
  if (!isTauri()) return;
  void getCurrentWindow().startDragging();
}

export function minimizeWindow(): void {
  if (!isTauri()) return;
  void getCurrentWindow().minimize();
}

export function toggleMaximizeWindow(): void {
  if (!isTauri()) return;
  void getCurrentWindow().toggleMaximize();
}

export function closeWindow(): void {
  if (!isTauri()) return;
  void getCurrentWindow().close();
}
