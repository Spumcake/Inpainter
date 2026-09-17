export default function UpdateBannerSkeleton() {
  return (
    <div
      className="h-11 shrink-0 overflow-hidden bg-[#141414] border-b border-[#333333] px-4 flex items-center gap-3"
      aria-hidden="true"
    >
      <span className="browser-skeleton h-4 w-4 rounded shrink-0" />
      <span className="browser-skeleton h-[14px] w-64 shrink-0" />
      <span className="browser-skeleton h-[14px] w-80 max-w-[40vw]" />
      <span className="browser-skeleton h-[26px] w-[4.75rem] shrink-0 rounded" />
      <span className="browser-skeleton ml-auto h-4 w-4 shrink-0 rounded" />
    </div>
  );
}
