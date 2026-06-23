'use client'

import { AlertTriangle } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="max-w-md mx-auto flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-red-400" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-foreground mb-1">Something went wrong</h2>
        <p className="text-muted-foreground text-sm">{error.message || 'An unexpected error occurred.'}</p>
      </div>
      <button
        onClick={reset}
        className="px-5 py-2.5 text-sm bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
