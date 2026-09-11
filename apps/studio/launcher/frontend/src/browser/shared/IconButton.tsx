import type { IconButtonProps } from "./types";

export default function IconButton({ icon: Icon, onClick, className = "" }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 text-neutral-400 hover:text-white hover:bg-[#333333] rounded-md transition-colors ${className}`}
    >
      <Icon size={18} />
    </button>
  );
}
