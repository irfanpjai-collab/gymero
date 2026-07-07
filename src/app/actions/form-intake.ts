'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { runFormIntakeSync, type FormIntakeSyncResult } from '@/lib/form-intake-sync'

// Manual trigger for the same sync the nightly cron runs (see
// src/app/api/cron/sync-form-intake/route.ts) — lets staff pull in new/edited
// form submissions on demand instead of waiting for the 4am run.
export async function syncFormIntakeNow(): Promise<FormIntakeSyncResult> {
  await requireRole(['admin', 'receptionist'])
  return runFormIntakeSync()
}

export interface FormIntakeIssue {
  id: string
  attemptedMemberId: string | null
  name: string | null
  mobile: string | null
  reason: string
  detectedAt: string
}

// Rows the last sync skipped due to a data-entry problem (bad/duplicate
// Member ID, missing name or mobile) — see form_intake_issues in
// form-intake-sync.ts. Always reflects only currently-unresolved rows.
export async function getFormIntakeIssues(): Promise<FormIntakeIssue[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('form_intake_issues')
      .select('id, attempted_member_id, name, mobile, reason, detected_at')
      .order('detected_at', { ascending: false })

    if (error) throw error
    return ((data ?? []) as {
      id: string; attempted_member_id: string | null; name: string | null
      mobile: string | null; reason: string; detected_at: string
    }[]).map(r => ({
      id: r.id,
      attemptedMemberId: r.attempted_member_id,
      name: r.name,
      mobile: r.mobile,
      reason: r.reason,
      detectedAt: r.detected_at,
    }))
  } catch (err) {
    console.error('getFormIntakeIssues error:', err)
    return []
  }
}

// A handful of Member IDs guaranteed not to be in use yet, so staff fixing a
// typo in the sheet (see getFormIntakeIssues) have something safe to type in
// without accidentally creating a fresh conflict. Same "highest + 1" sequence
// convention used when creating a member normally — see getNextMemberId in
// members.ts — just extended a few numbers further.
export async function getAvailableMemberIds(count = 5): Promise<number[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('members')
      .select('member_id')
      .order('member_id', { ascending: false })
      .limit(1)
      .maybeSingle()

    const next = ((data as { member_id: number } | null)?.member_id ?? 99) + 1
    return Array.from({ length: count }, (_, i) => next + i)
  } catch (err) {
    console.error('getAvailableMemberIds error:', err)
    return []
  }
}
