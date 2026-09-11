export default function InstallsListSkeleton() {
  return (
    <div
      className="relative flex-1 flex flex-col bg-[#1c1c1c] overflow-hidden"
      aria-busy="true"
      aria-label="Loading installs"
    >
      <div className="px-8 pt-6 border-b border-[#333] flex gap-6 text-sm font-medium">
        <div className="pb-3 border-b-2 border-white">
          <span className="browser-skeleton h-5 w-16" />
        </div>
        <div className="pb-3 border-b-2 border-transparent">
          <span className="browser-skeleton h-5 w-14" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-[48%] border-r border-[#333] p-3 space-y-2">
          <span className="browser-skeleton h-5 w-28" />
          <span className="browser-skeleton ml-4 h-5 w-24" />
          <span className="browser-skeleton ml-4 h-5 w-20" />
          <span className="browser-skeleton h-5 w-24" />
        </div>
        <div className="w-[52%] p-6 space-y-3">
          <span className="browser-skeleton h-5 w-32" />
          <span className="browser-skeleton h-4 w-full" />
          <span className="browser-skeleton h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
