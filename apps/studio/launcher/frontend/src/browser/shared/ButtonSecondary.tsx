import type { ButtonProps } from "./types";

export default function ButtonSecondary({ children, onClick, className = "" }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`bg-transparent border border-neutral-500 hover:border-neutral-300 text-neutral-300 hover:text-white font-medium py-1.5 px-4 rounded transition-colors text-sm ${className}`}
    >
      {children}
    </button>
  );
}
