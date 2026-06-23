'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

const PUNCH_LABELS: Record<number, string> = {
  0: 'checked in',
  1: 'checked out',
  4: 'checked in (OT)',
  5: 'checked out (OT)',
}

interface AttendanceLogRow {
  member_id: string | null
  device_user_id: string
  punched_at: string
  punch_type: number
}

/**
 * Mounted once in the dashboard layout — shows a toast for every fingerprint
 * punch no matter which page is open. Subscribes to Supabase Realtime changes
 * on attendance_logs (which the bridge writes to directly the instant it
 * detects a punch) rather than connecting to the bridge's own SSE stream —
 * so this works from anywhere with zero dependency on Tailscale/the bridge
 * being reachable. Independent of and doesn't touch the Biometric page's own
 * live feed, which still talks to the bridge directly.
 */
export default function PunchNotifier() {
  const nameByUuidRef = useRef<Record<string, string>>({})

  useEffect(() => {
    const supabase = createClient()

    supabase.from('members').select('id, full_name').then(({ data }) => {
      const map: Record<string, string> = {}
      for (const m of data ?? []) map[m.id] = m.full_name
      nameByUuidRef.current = map
    })

    const channel = supabase
      .channel('attendance_logs_notifier')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_logs' },
        (payload) => {
          const row = payload.new as AttendanceLogRow
          const name = row.member_id
            ? nameByUuidRef.current[row.member_id] ?? `Member #${row.device_user_id}`
            : `Member #${row.device_user_id}`
          const action = PUNCH_LABELS[row.punch_type] ?? 'punched'
          const time = new Date(row.punched_at).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit',
          })

          toast.success(`${name} ${action}`, { description: time })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return null
}
