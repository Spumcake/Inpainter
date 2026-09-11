import type { ReactNode } from "react";
import { X } from "lucide-react";

export type BrowserModalProps = {
  title: string;
  badge?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export default function BrowserModal({
  title,
  badge,
  onClose,
  children,
  className = "w-[850px] h-[440px]",
}: BrowserModalProps) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className={`${className} bg-[#1e1e1e] rounded-xl shadow-2xl flex flex-col overflow-hidden`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 px-6 border-b border-[#333] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{title}</h2>
            {badge ? (
              <span className="px-2 py-0.5 bg-[#333] text-neutral-300 text-xs rounded font-medium border border-[#444] shrink-0">
                {badge}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-md hover:bg-[#333] transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function BrowserModalBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center text-sm text-neutral-500 px-8 text-center">
      {children}
    </div>
  );
}
