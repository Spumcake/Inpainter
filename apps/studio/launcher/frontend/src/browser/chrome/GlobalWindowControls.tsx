import { Bell } from "lucide-react";
import IconButton from "../shared/IconButton";
import WindowControls from "./WindowControls";

export default function GlobalWindowControls() {
  return (
    <div
      className="h-10 bg-[#141414] border-b border-[#333333] flex justify-end items-center px-0 shrink-0"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-0.5 mr-4" data-tauri-drag-region="false">
        <IconButton icon={Bell} />
        <div className="w-6 h-6 rounded-full bg-white text-black text-xs flex items-center justify-center font-bold">
          D
        </div>
      </div>
      <div data-tauri-drag-region="false">
        <WindowControls />
      </div>
    </div>
  );
}
