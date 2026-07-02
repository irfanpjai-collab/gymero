export default function MembersLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="h-8 w-28 bg-muted rounded-lg animate-pulse" />
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-muted rounded-xl animate-pulse" />
          <div className="h-9 w-32 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="h-10 flex-1 bg-muted rounded-xl animate-pulse" />
        <div className="h-10 w-28 bg-muted rounded-xl animate-pulse" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="divide-y divide-border">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-36 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
              <div className="h-6 w-16 bg-muted rounded-full" />
              <div className="h-4 w-20 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded hidden md:block" />
              <div className="h-8 w-8 bg-muted rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
