export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <div className="h-8 w-32 bg-muted rounded-lg animate-pulse" />
        <div className="h-4 w-52 bg-muted rounded animate-pulse" />
      </div>
      <div className="h-16 bg-muted rounded-2xl animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5 animate-pulse">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-7 w-14 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <div className="h-5 w-32 bg-muted rounded animate-pulse" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
                <div className="flex-1 h-4 bg-muted rounded" />
                <div className="w-20 h-4 bg-muted rounded" />
                <div className="w-8 h-4 bg-muted rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <div className="h-5 w-32 bg-muted rounded animate-pulse" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-24 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
