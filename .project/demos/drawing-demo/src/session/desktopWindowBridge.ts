import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../tauri-env';

export async function spawnDesktopWindow(): Promise<void> {
  if (!isTauri()) return;
  await invoke('spawn_desktop_window');
}
