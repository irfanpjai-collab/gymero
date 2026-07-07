import type { SupabaseClient } from '@supabase/supabase-js'

// Shared by the manual "Bulk Enroll" button (src/app/actions/adms.ts) and by
// the form-intake sync (form-intake-sync.ts), which calls this after every
// run so a member added via the Google Form — or anyone ever missed by any
// other path — gets queued for the device automatically, not just on a
// manual click. Lives outside any 'use server' file specifically because it
// takes a Supabase client instance as a parameter, which isn't serializable
// and can't be an argument to an exported Server Action.
export async function queueMissingEnrollments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  requestedBy: string | null
): Promise<{ queued: number; skipped: number }> {
  const { data: members, error } = await supabase
    .from('members')
    .select('member_id, full_name')
    .is('deleted_at', null)
    .order('member_id', { ascending: true })

  if (error) throw error
  if (!members || members.length === 0) return { queued: 0, skipped: 0 }

  // Skip anyone already enrolled (ever punched in, or their latest completed
  // enroll/remove command was an enroll) or already sitting in the queue
  // (pending/sent enroll not yet resolved) — otherwise re-running this
  // queues a full duplicate batch on top of whatever's already there.
  const [{ data: punches }, { data: doneCommands }, { data: inFlight }] = await Promise.all([
    supabase.from('attendance_logs').select('device_user_id'),
    supabase
      .from('adms_commands')
      .select('member_id, operation, created_at')
      .eq('status', 'done')
      .in('operation', ['enroll', 'remove'])
      .order('created_at', { ascending: true }),
    supabase.from('adms_commands').select('member_id').eq('operation', 'enroll').in('status', ['pending', 'sent']),
  ])

  const everPunched = new Set(
    ((punches ?? []) as { device_user_id: string }[]).map(a => Number(a.device_user_id)).filter(n => !Number.isNaN(n))
  )
  const latestEnrollRemove: Record<number, 'enroll' | 'remove'> = {}
  for (const cmd of (doneCommands ?? []) as { member_id: number; operation: 'enroll' | 'remove' }[]) {
    latestEnrollRemove[cmd.member_id] = cmd.operation
  }
  const alreadyQueued = new Set(((inFlight ?? []) as { member_id: number }[]).map(c => c.member_id))

  const toEnroll = (members as { member_id: number; full_name: string }[]).filter(m =>
    !alreadyQueued.has(m.member_id) &&
    !everPunched.has(m.member_id) &&
    latestEnrollRemove[m.member_id] !== 'enroll'
  )

  if (toEnroll.length === 0) return { queued: 0, skipped: members.length }

  const { error: insertError } = await supabase.from('adms_commands').insert(
    toEnroll.map(m => ({
      operation: 'enroll' as const,
      member_id: m.member_id,
      full_name: m.full_name,
      requested_by: requestedBy,
    }))
  )
  if (insertError) throw insertError

  return { queued: toEnroll.length, skipped: members.length - toEnroll.length }
}
