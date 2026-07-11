import Link from 'next/link'
import { Dumbbell } from 'lucide-react'

// Root-level 404 — catches any URL that doesn't match a route (typo'd link,
// stale bookmark, a deleted member's old direct link). Without this, Next's
// default unstyled 404 gave staff no way back into the app.
export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center gap-4">
      <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Dumbbell className="w-6 h-6 text-primary" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-foreground mb-1">Page not found</h1>
        <p className="text-muted-foreground text-sm">This page doesn&apos;t exist or may have moved.</p>
      </div>
      <Link
        href="/dashboard"
        className="px-5 py-2.5 text-sm bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
