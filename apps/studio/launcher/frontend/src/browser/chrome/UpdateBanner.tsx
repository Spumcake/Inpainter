import logoMarks from "../../assets/logo-marks.svg";
import type { UpdateBannerPayload } from "../shared/types";

type UpdateBannerProps = {
  banner: UpdateBannerPayload;
  onDismiss: () => void;
};

export default function UpdateBanner({ banner, onDismiss }: UpdateBannerProps) {
  return (
    <div className="h-11 shrink-0 overflow-hidden bg-[#141414] border-b border-[#333333] px-4 flex items-center gap-3 text-sm">
      <img src={logoMarks} alt="" className="h-4 w-4 shrink-0" />
      <span className="text-white font-semibold whitespace-nowrap">{banner.title}</span>
      <span className="text-neutral-300 whitespace-nowrap truncate">{banner.body}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-neutral-300 border border-neutral-600 rounded px-2 py-1 hover:text-white hover:border-neutral-400 text-xs transition-colors"
      >
        Dismiss
      </button>
    </div>
  );
}
