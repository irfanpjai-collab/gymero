'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCw, Loader2 } from 'lucide-react'
import { syncFormIntakeNow } from '@/app/actions/form-intake'

// Manual trigger for the same sync the nightly cron runs — lets staff pull in
// a just-submitted form response immediately instead of waiting until 4am.
export default function SyncFormIntakeButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSyncing, setIsSyncing] = useState(false)

  function handleClick() {
    setIsSyncing(true)
    startTransition(async () => {
      const result = await syncFormIntakeNow()
      setIsSyncing(false)

      if (result.errors.length > 0) {
        toast.error(`Sync had errors: ${result.errors[0]}${result.errors.length > 1 ? ` (+${result.errors.length - 1} more)` : ''}`)
        return
      }

      const parts = []
      if (result.created > 0) parts.push(`${result.created} added`)
      if (result.updated > 0) parts.push(`${result.updated} updated`)
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
      toast.success(parts.length > 0 ? `Sync complete — ${parts.join(', ')}` : 'Sync complete — no changes')

      if (result.warnings.length > 0) {
        toast.warning(result.warnings[0] + (result.warnings.length > 1 ? ` (+${result.warnings.length - 1} more)` : ''))
      }

      router.refresh()
    })
  }

  const busy = isPending || isSyncing

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-border hover:border-border-bright text-muted-foreground hover:text-foreground rounded-xl transition-colors disabled:opacity-60"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      {busy ? 'Syncing…' : 'Sync from Form'}
    </button>
  )
}
