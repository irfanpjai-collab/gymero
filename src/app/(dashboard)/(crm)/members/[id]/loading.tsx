export default function MemberDetailLoading() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 bg-muted rounded-xl animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-7 w-44 bg-muted rounded-lg animate-pulse" />
          <div className="h-4 w-28 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4 animate-pulse">
            <div className="h-5 w-32 bg-muted rounded" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-16 bg-muted rounded" />
                  <div className="h-5 w-28 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border overflow-hidden animate-pulse">
            <div className="px-5 py-4 border-b border-border h-14 bg-muted/30" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-5 py-3 border-b border-border last:border-0">
                <div className="flex-1 h-4 bg-muted rounded" />
                <div className="w-20 h-4 bg-muted rounded" />
                <div className="w-16 h-4 bg-muted rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4 animate-pulse">
            <div className="h-5 w-28 bg-muted rounded" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 w-full bg-muted rounded" />
              ))}
            </div>
            <div className="h-10 w-full bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
