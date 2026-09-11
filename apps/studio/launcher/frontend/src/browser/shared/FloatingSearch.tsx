import { Search } from "lucide-react";
import type { FloatingSearchProps } from "./types";

export default function FloatingSearch({ value, onChange, placeholder = "Search" }: FloatingSearchProps) {
  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[min(420px,calc(100%-2rem))]">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-[#2a2a2a]/95 backdrop-blur border border-[#444] text-sm rounded-lg px-3 py-2.5 pl-9 shadow-lg focus:outline-none focus:border-[#666] text-white"
        />
      </div>
    </div>
  );
}
