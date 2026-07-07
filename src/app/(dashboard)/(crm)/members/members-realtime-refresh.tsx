'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Re-fetches the Members page's server data the instant a member or
// membership row changes — without this, someone with the page already open
// wouldn't see a form-intake sync's writes (e.g. from the Apps Script
// on-submit trigger, or the nightly cron) until they manually reloaded.
// Debounced since a sheet sync can write many rows in one batch — no need to
// re-render the page once per row.
export default function MembersRealtimeRefresh() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), 600)
    }

    const channel = supabase
      .channel('members_page_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memberships' }, scheduleRefresh)
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
