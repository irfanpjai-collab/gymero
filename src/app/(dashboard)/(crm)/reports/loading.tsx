export default function ReportsLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 bg-muted rounded-lg animate-pulse" />
        <div className="h-9 w-28 bg-muted rounded-xl animate-pulse" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-24 bg-muted rounded-lg animate-pulse" />
        <div className="h-9 w-24 bg-muted rounded-lg animate-pulse" />
      </div>
      <div className="bg-card rounded-2xl border border-border p-6 animate-pulse">
        <div className="h-5 w-32 bg-muted rounded mb-4" />
        <div className="h-52 bg-muted/50 rounded-xl" />
      </div>
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border h-14 bg-muted/20 animate-pulse" />
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
              <div className="flex-1 h-4 bg-muted rounded" />
              <div className="w-24 h-4 bg-muted rounded" />
              <div className="w-16 h-4 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
