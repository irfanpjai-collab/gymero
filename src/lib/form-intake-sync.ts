import { createAdminClient } from '@/lib/supabase/admin'
import { getSheetValues } from '@/lib/google-sheets'
import { revalidateTag, revalidatePath } from 'next/cache'

// Pulls new/edited rows from the gym's Google Form intake sheet (a *separate*
// spreadsheet from the one-way backup in sheets-backup.ts — this direction is
// Sheet -> Supabase) and upserts them into members, keyed by the Member ID
// column staff fill in after reviewing each submission.
//
// Sheet columns (Form responses 1): Timestamp, Name, Member ID, Mobile Number,
// Place, JOIN DATE, MEMBERSHIP MONTH. Dates are DD/MM/YYYY (day-first, same
// convention as the rest of this app).
//
// On first creation only (never on update, so it can't clobber anything staff
// have since changed by hand), also creates a real membership for a
// recognized MEMBERSHIP MONTH value (1=Monthly, 3=Quarterly) — these are
// treated as already paid in cash outside the system, so payment_pending is
// false, but deliberately no `payments` row is inserted: revenue/accounts
// figures should only reflect payments actually recorded through the UI, not
// an automated import.

const TAB_RANGE = "'Form responses 1'!A2:G"

function parseSheetDate(raw: string | undefined): string | null {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Only "1" and "3" are real plan durations seen in this form. Anything else
// (blank, or a stray typo like "43") isn't a plan value — ignored rather than
// stored as a nonsense note or matched to a real plan.
function membershipDurationMonths(month: string | undefined): number | null {
  if (month === '1') return 1
  if (month === '3') return 3
  return null
}

interface ParsedRow {
  memberId: number
  name: string
  mobile: string
  place: string | undefined
  joinDate: string | null
  membershipMonth: string | undefined
}

export interface FormIntakeSyncResult {
  ok: boolean
  created: number
  updated: number
  skipped: number
  warnings: string[] // routine, expected — incomplete/malformed rows, or a Member ID conflict to fix by hand
  errors: string[]    // real failures — config, sheet fetch, or DB operations
}

export async function runFormIntakeSync(): Promise<FormIntakeSyncResult> {
  const result: FormIntakeSyncResult = { ok: false, created: 0, updated: 0, skipped: 0, warnings: [], errors: [] }

  const spreadsheetId = process.env.GYM_INTAKE_FORM_SPREADSHEET_ID
  if (!spreadsheetId) {
    result.errors.push('GYM_INTAKE_FORM_SPREADSHEET_ID not configured')
    return result
  }

  let rawRows: string[][]
  try {
    rawRows = await getSheetValues(spreadsheetId, TAB_RANGE)
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
    return result
  }

  const parsed: ParsedRow[] = []
  for (const row of rawRows) {
    const name = row[1]?.trim()
    const memberIdRaw = row[2]?.trim()
    const mobile = row[3]?.trim()
    const place = row[4]?.trim()
    const joinDate = parseSheetDate(row[5])
    const membershipMonth = row[6]?.trim()

    if (!name && !memberIdRaw) continue // blank row

    const memberId = parseInt(memberIdRaw ?? '', 10)
    if (!memberId || memberId < 1) {
      result.skipped++
      result.warnings.push(`Skipped "${name ?? 'unknown'}": invalid/missing Member ID "${memberIdRaw ?? ''}"`)
      continue
    }
    if (!name || !mobile) {
      result.skipped++
      result.warnings.push(`Skipped Member ID ${memberId}: missing name or mobile`)
      continue
    }

    parsed.push({ memberId, name, mobile, place, joinDate, membershipMonth })
  }

  // Same Member ID used for genuinely different people is a sheet data-entry
  // error (this happens in practice — two people can end up with the same
  // typed-in ID), not something to silently resolve by "last row wins", since
  // that would quietly merge two different members' data under one record.
  // Skip every row for any ID where the name disagrees and surface it so a
  // human can fix the sheet.
  const byId = new Map<number, ParsedRow[]>()
  for (const row of parsed) {
    const list = byId.get(row.memberId) ?? []
    list.push(row)
    byId.set(row.memberId, list)
  }

  const supabase = createAdminClient()

  const { data: plans } = await supabase
    .from('membership_plans')
    .select('id, duration_months, fee')
    .eq('is_active', true)
    .in('duration_months', [1, 3])
  const planByDuration = new Map((plans ?? []).map(p => [p.duration_months, p]))

  // Shared by both the brand-new-member path and the retroactive path below —
  // only ever called when the member has zero memberships, so this can't
  // clobber a plan staff have since corrected by hand. Needs a real start
  // date to compute an expiry; if the sheet's Join Date is blank and the
  // member has no join date on file either, skips with a warning instead of
  // guessing "today" (which would misrepresent when they actually joined).
  async function createMembershipIfNone(
    memberUuid: string,
    memberIdForLog: number,
    startDate: string | null,
    plan: { id: string; duration_months: number; fee: number } | undefined
  ): Promise<void> {
    if (!plan) return
    if (!startDate) {
      result.warnings.push(
        `Member ID ${memberIdForLog}: has a membership month but no Join Date to compute the membership from — add a Join Date and re-sync`
      )
      return
    }

    const expiry = new Date(startDate)
    expiry.setMonth(expiry.getMonth() + plan.duration_months)

    const { error } = await supabase.from('memberships').insert({
      member_id: memberUuid,
      plan_id: plan.id,
      start_date: startDate,
      expiry_date: expiry.toISOString().slice(0, 10),
      amount: plan.fee,
      status: 'active',
      payment_pending: false, // treated as already paid in cash — no `payments` row, so this stays out of Accounts
    })
    if (error) result.errors.push(`Member ID ${memberIdForLog}: membership creation failed — ${error.message}`)
  }

  for (const [memberId, entries] of byId) {
    const distinctNames = new Set(entries.map(e => e.name.toLowerCase()))
    if (distinctNames.size > 1) {
      result.skipped += entries.length
      result.warnings.push(
        `Skipped Member ID ${memberId}: used by multiple different names in the sheet (${[...distinctNames].join(' / ')}) — fix the duplicate before this can sync`
      )
      continue
    }

    // Multiple rows for the same person (re-submission/edit) — the sheet's
    // last row for that ID is authoritative.
    const row = entries[entries.length - 1]

    const { data: existing, error: lookupError } = await supabase
      .from('members')
      .select('id, join_date')
      .eq('member_id', memberId)
      .maybeSingle()

    if (lookupError) {
      result.errors.push(`Member ID ${memberId}: lookup failed — ${lookupError.message}`)
      continue
    }

    const durationMonths = membershipDurationMonths(row.membershipMonth)
    const plan = durationMonths ? planByDuration.get(durationMonths) : undefined

    const payload: Record<string, unknown> = { full_name: row.name, mobile: row.mobile, address: row.place || null }
    // A blank Join Date on a re-sync must never overwrite an already-known
    // one — only ever set it going from unknown to known.
    if (row.joinDate) payload.join_date = row.joinDate

    if (existing) {
      const { error } = await supabase.from('members').update(payload).eq('member_id', memberId)
      if (error) {
        result.errors.push(`Member ID ${memberId}: update failed — ${error.message}`)
        continue
      }
      result.updated++

      // Covers syncing before MEMBERSHIP MONTH was filled in: if this member
      // still has no membership at all, and the sheet now specifies a valid
      // one, create it now instead of silently doing nothing.
      const { count } = await supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', (existing as { id: string }).id)
      if (!count) {
        const existingJoinDate = (existing as { join_date: string | null }).join_date
        await createMembershipIfNone(
          (existing as { id: string }).id,
          memberId,
          row.joinDate ?? existingJoinDate,
          plan
        )
      }
      continue
    }

    // New member — a blank Join Date is left genuinely unknown (null) rather
    // than silently stamped with today's (sync) date.
    const insertPayload = { ...payload, member_id: memberId, join_date: row.joinDate ?? null } as Record<string, unknown>
    if (durationMonths) {
      insertPayload.notes = `Requested plan (from intake form): ${durationMonths === 1 ? 'Monthly' : 'Quarterly'}`
    }

    const { data: inserted, error } = await supabase.from('members').insert(insertPayload).select('id').single()
    if (error) {
      result.errors.push(`Member ID ${memberId}: insert failed — ${error.message}`)
      continue
    }
    result.created++

    await createMembershipIfNone((inserted as { id: string }).id, memberId, row.joinDate, plan)
  }

  // Without this, the Dashboard/Members pages (both behind unstable_cache,
  // see src/lib/cached-queries.ts) wouldn't pick up what this cron just wrote
  // until their normal 5-minute revalidate window happened to expire —
  // correct in the DB immediately, invisible in the UI for up to 5 minutes.
  if (result.created > 0 || result.updated > 0) {
    revalidateTag('members', {})
    revalidatePath('/members')
    revalidatePath('/dashboard')
  }

  result.ok = result.errors.length === 0
  return result
}
