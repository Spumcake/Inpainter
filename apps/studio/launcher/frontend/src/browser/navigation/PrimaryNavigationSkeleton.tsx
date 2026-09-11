const labelWidths = ["w-16", "w-14", "w-[4.25rem]", "w-[4.5rem]", "w-12", "w-12"];

export default function PrimaryNavigationSkeleton({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <nav className="flex-1 px-1.5 space-y-0.5 overflow-y-auto" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="w-full flex items-center justify-center p-2">
            <span className="browser-skeleton h-[18px] w-[18px] rounded" />
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="w-full flex items-center rounded-md text-sm">
          <div className="flex-1 flex items-center gap-3 px-3 py-2">
            <span className="browser-skeleton h-[18px] w-[18px] shrink-0 rounded" />
            <span className="h-5 flex items-center">
              <span className={`browser-skeleton h-[14px] ${labelWidths[index] ?? "w-14"}`} />
            </span>
          </div>
          {index < 3 ? (
            <div className="mr-1 p-1.5">
              <span className="browser-skeleton h-[14px] w-[14px] rounded" />
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
