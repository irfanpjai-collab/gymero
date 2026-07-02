export default function CoachesLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 bg-muted rounded-lg animate-pulse" />
        <div className="h-9 w-28 bg-muted rounded-xl animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-6 space-y-4 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-muted flex-shrink-0" />
              <div className="space-y-1.5">
                <div className="h-5 w-32 bg-muted rounded" />
                <div className="h-4 w-20 bg-muted rounded" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full bg-muted rounded" />
              <div className="h-4 w-3/4 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
