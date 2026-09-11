import closeIcon from "../../assets/close.svg";
import maximizeIcon from "../../assets/maximize.svg";
import minimizeIcon from "../../assets/minimize.svg";
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from "../../nativeWindow";

export default function WindowControls() {
  return (
    <div className="flex items-center text-neutral-500">
      <button
        type="button"
        className="group px-3 h-10 flex items-center justify-center hover:bg-[#2a2a2a]"
        onClick={minimizeWindow}
        aria-label="Minimize"
      >
        <img src={minimizeIcon} alt="" className="h-3 w-3 opacity-70 group-hover:opacity-100" />
      </button>
      <button
        type="button"
        className="group px-3 h-10 flex items-center justify-center hover:bg-[#2a2a2a]"
        onClick={toggleMaximizeWindow}
        aria-label="Maximize"
      >
        <img src={maximizeIcon} alt="" className="h-3 w-3 opacity-70 group-hover:opacity-100" />
      </button>
      <button
        type="button"
        className="group px-3 h-10 flex items-center justify-center hover:bg-red-600"
        onClick={closeWindow}
        aria-label="Close"
      >
        <img src={closeIcon} alt="" className="h-3 w-3 opacity-70 group-hover:opacity-100" />
      </button>
    </div>
  );
}
