'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidateTag, revalidatePath } from 'next/cache'
import { DEFAULT_GRACE_PERIOD_DAYS } from '@/lib/utils'

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

    const supabase = await createClient()
    const { error } = await supabase
      .from('app_settings')
      .upsert({ id: 1, grace_period_days: Math.round(days), updated_at: new Date().toISOString(), updated_by: profile.user_id })
    if (error) throw error

    revalidateTag('settings', {})
    revalidateTag('members', {})
    revalidatePath('/dashboard')
    revalidatePath('/members')
    revalidatePath('/reports')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
