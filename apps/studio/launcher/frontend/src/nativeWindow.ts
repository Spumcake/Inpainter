import { getCurrentWindow } from "@tauri-apps/api/window";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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
