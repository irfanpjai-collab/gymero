'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Generic version of members-realtime-refresh.tsx — watches the given
// database tables directly and busts + refreshes the page on any change.
// This is deliberately independent of revalidateTag: it observes real row
// changes in Postgres, not application code, so it still works correctly
// even if a *future* mutation forgets to call revalidateTag, or if a row is
// ever edited directly in the Supabase table editor. `onChange` should be a
// server action that calls revalidateTag/revalidatePath for this page.
export default function TableRealtimeRefresh({
  channelName,
  tables,
  onChange,
}: {
  channelName: string
  tables: string[]
  onChange: () => Promise<void>
}) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer)
      // Short enough to feel instant, long enough to coalesce a single
      // transaction's multiple writes (e.g. a renewal's admission-fee +
      // membership-fee payments) into one refresh instead of two.
      timer = setTimeout(() => {
        onChange().then(() => router.refresh())
      }, 400)
    }

    let channel = supabase.channel(channelName)
    for (const table of tables) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh)
    }
    channel.subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
    // channelName/tables/onChange are fixed per page (module-level or stable
    // refs), so this only ever needs to (re)subscribe once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName])

  return null
}
