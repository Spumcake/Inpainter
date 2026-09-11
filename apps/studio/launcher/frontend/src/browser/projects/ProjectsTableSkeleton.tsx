const columns = "grid grid-cols-[48px_minmax(0,1fr)_9rem_7rem_48px] items-start gap-x-0";

const rows = [
  { name: "w-40", path: "w-72", modified: "w-[5.5rem]", size: "w-12" },
  { name: "w-36", path: "w-80", modified: "w-[5.5rem]", size: "w-14" },
  { name: "w-32", path: "w-64", modified: "w-16", size: "w-12" },
  { name: "w-44", path: "w-72", modified: "w-14", size: "w-14" },
];

export default function ProjectsTableSkeleton() {
  return (
    <div
      className="relative flex-1 flex flex-col bg-[#1c1c1c] overflow-hidden"
      aria-busy="true"
      aria-label="Loading projects"
    >
      <div className="flex-1 overflow-hidden px-8 pt-6 pb-20">
        <div className={`${columns} text-xs font-medium border-b border-[#333] pb-2 mb-2`}>
          <div />
          <div className="flex items-center h-4">
            <span className="browser-skeleton h-3 w-10" />
          </div>
          <div className="flex items-center h-4">
            <span className="browser-skeleton h-3 w-14" />
          </div>
          <div className="flex items-center h-4">
            <span className="browser-skeleton h-3 w-8" />
          </div>
          <div className="flex justify-center items-center h-4">
            <span className="browser-skeleton h-[14px] w-[14px] rounded" />
          </div>
        </div>

        {rows.map((row, index) => (
          <div key={index} className="mb-0.5">
            <div className={`${columns} py-3 px-0`}>
              <div className="flex items-center justify-start pl-2 h-5">
                <span className="browser-skeleton h-4 w-4 rounded" />
              </div>
              <div className="min-w-0 pr-4">
                <div className="h-5 flex items-center">
                  <span className={`browser-skeleton h-[14px] ${row.name}`} />
                </div>
                <div className="mt-[5px] h-4 flex items-center">
                  <span className={`browser-skeleton h-2.5 ${row.path} max-w-full`} />
                </div>
              </div>
              <div className="h-5 flex items-center">
                <span className={`browser-skeleton h-[14px] ${row.modified}`} />
              </div>
              <div className="h-5 flex items-center">
                <span className={`browser-skeleton h-[14px] ${row.size}`} />
              </div>
              <div className="flex justify-center h-5 items-center">
                <span className="browser-skeleton h-[18px] w-[18px] rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
