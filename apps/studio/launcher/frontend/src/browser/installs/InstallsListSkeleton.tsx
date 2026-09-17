export default function InstallsListSkeleton() {
  return (
    <div
      className="relative flex-1 flex flex-col bg-[#1c1c1c] overflow-hidden"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex items-end gap-6 border-b border-[#333] pl-4 pr-4 pt-5 text-sm font-medium">
        <div className="pb-2 border-b-2 border-white">
          <span className="browser-skeleton h-5 w-16" />
        </div>
        <div className="pb-2 border-b-2 border-transparent">
          <span className="browser-skeleton h-5 w-14" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-[280px] shrink-0 space-y-2 border-r border-[#333] py-3 pl-4 pr-2">
          <span className="browser-skeleton h-5 w-28" />
          <span className="browser-skeleton ml-4 h-5 w-24" />
          <span className="browser-skeleton ml-4 h-5 w-20" />
          <span className="browser-skeleton h-5 w-24" />
        </div>
        <div className="min-w-0 flex-1 space-y-3 py-3 pl-2 pr-4">
          <span className="browser-skeleton h-5 w-32" />
          <span className="browser-skeleton h-4 w-full" />
          <span className="browser-skeleton h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
