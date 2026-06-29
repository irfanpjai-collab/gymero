import { createClient } from '@/lib/supabase/client'

// Both PunchNotifier (mounted globally) and the Biometric page used to each
// open their own postgres_changes channel bound to attendance_logs. With
// both active at once, only one of them ever actually received the INSERT
// broadcast — the channel join always reported SUBSCRIBED, but events
// silently stopped reaching one of the two. Rather than chase that further,
// this gives the whole app exactly one realtime binding for this table, with
// multiple listeners — removing the duplication removes the conflict
// regardless of its exact cause.

type AttendanceRow = {
  member_id: string | null
  device_user_id: string
  punched_at: string
  punch_type: number
}

type Listener = (row: AttendanceRow) => void

let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null
const listeners = new Set<Listener>()

export function subscribeToAttendanceInserts(listener: Listener): () => void {
  listeners.add(listener)

  if (!channel) {
    const supabase = createClient()
    channel = supabase
      .channel('attendance_logs_shared')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_logs' },
        (payload) => {
          if (payload.eventType !== 'INSERT') return
          const row = payload.new as AttendanceRow
          listeners.forEach((l) => l(row))
        }
      )
      .subscribe((status) => {
        console.log('[attendance-bus] realtime channel status:', status)
      })
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && channel) {
      const supabase = createClient()
      supabase.removeChannel(channel)
      channel = null
    }
  }
}
