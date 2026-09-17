import { ArrowRight } from "lucide-react";
import logoMarks from "../../assets/logo-marks.svg";
import type { UpdateBannerPayload } from "../shared/types";

type UpdateBannerProps = {
  banner: UpdateBannerPayload;
  onDismiss: () => void;
};

export default function UpdateBanner({ banner, onDismiss }: UpdateBannerProps) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 overflow-hidden border-b border-[#333333] bg-[#141414] px-4 text-sm">
      <img src={logoMarks} alt="" className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap font-semibold text-white">{banner.title}</span>
      <span className="min-w-0 truncate whitespace-nowrap text-neutral-300">{banner.body}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-400 hover:text-white"
      >
        Dismiss
      </button>
      <ArrowRight size={16} className="ml-auto shrink-0 text-neutral-300" aria-hidden="true" />
    </div>
  );
}
