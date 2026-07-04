'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidateTag, revalidatePath } from 'next/cache'
import { DEFAULT_GRACE_PERIOD_DAYS } from '@/lib/utils'

// Supabase's query errors are plain objects with a `.message`, not real
// `Error` instances — `String(err)` on one of those prints "[object Object]"
// instead of anything useful, which is exactly what surfaced this.
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}

// Single source of truth for grace period, readable from server components
// (Dashboard, Members, Reports) — not the old localStorage-only value, which
// server-rendered pages couldn't see and which silently diverged between
// browsers/devices.
export async function getGracePeriodDays(): Promise<number> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('app_settings').select('grace_period_days').eq('id', 1).maybeSingle()
    return data?.grace_period_days ?? DEFAULT_GRACE_PERIOD_DAYS
  } catch (err) {
    console.error('getGracePeriodDays error:', err)
    return DEFAULT_GRACE_PERIOD_DAYS
  }
}

export async function updateGracePeriodDays(days: number): Promise<{ error?: string }> {
  try {
    const profile = await requireRole(['admin'])
    if (!Number.isFinite(days) || days < 0) throw new Error('Grace period must be a non-negative number')

    // A plain update, not upsert — the singleton row (id=1) is guaranteed to
    // already exist (seeded by app_settings.sql). Upsert would also require
    // an INSERT policy to satisfy RLS on its ON CONFLICT path even though the
    // row already exists and it'd always take the update branch anyway.
    const supabase = await createClient()
    const { error } = await supabase
      .from('app_settings')
      .update({ grace_period_days: Math.round(days), updated_at: new Date().toISOString(), updated_by: profile.user_id })
      .eq('id', 1)
    if (error) throw error

    revalidateTag('settings', {})
    revalidateTag('members', {})
    revalidatePath('/dashboard')
    revalidatePath('/members')
    revalidatePath('/reports')
    return {}
  } catch (err) {
    return { error: errorMessage(err) }
  }
}
