import type { ButtonProps } from "./types";

export default function ButtonPrimary({ children, onClick, className = "" }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`bg-white hover:bg-neutral-200 text-black font-medium py-1.5 px-4 rounded transition-colors text-sm ${className}`}
    >
      {children}
    </button>
  );
}
