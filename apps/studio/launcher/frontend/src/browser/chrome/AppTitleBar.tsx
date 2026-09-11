import WindowControls from "./WindowControls";

export default function AppTitleBar() {
  return (
    <div className="h-10 bg-[#000] flex justify-end items-center shrink-0" data-tauri-drag-region>
      <div data-tauri-drag-region="false">
        <WindowControls />
      </div>
    </div>
  );
}
