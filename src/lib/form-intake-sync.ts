import { createAdminClient } from '@/lib/supabase/admin'
import { getSheetValues } from '@/lib/google-sheets'

// Pulls new/edited rows from the gym's Google Form intake sheet (a *separate*
// spreadsheet from the one-way backup in sheets-backup.ts — this direction is
// Sheet -> Supabase) and upserts them into members, keyed by the Member ID
// column staff fill in after reviewing each submission.
//
// Sheet columns (Form responses 1): Timestamp, Name, Member ID, Mobile Number,
// Place, JOIN DATE, MEMBERSHIP MONTH. Dates are DD/MM/YYYY (day-first, same
// convention as the rest of this app).
//
// Deliberately does NOT create a membership/payment record — the form has no
// amount/payment-method data, so fabricating one would show a member as paid
// when they might not be. MEMBERSHIP MONTH is stored in notes, but only on
// first creation — an update never touches notes, so it can't clobber
// whatever staff have since written there by hand.

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
// stored as a nonsense note.
function membershipPlanLabel(month: string | undefined): string | null {
  if (month === '1') return 'Monthly'
  if (month === '3') return 'Quarterly'
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
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()

    if (lookupError) {
      result.errors.push(`Member ID ${memberId}: lookup failed — ${lookupError.message}`)
      continue
    }

    const payload: Record<string, unknown> = { full_name: row.name, mobile: row.mobile, address: row.place || null }
    if (row.joinDate) payload.join_date = row.joinDate

    if (existing) {
      const { error } = await supabase.from('members').update(payload).eq('member_id', memberId)
      if (error) result.errors.push(`Member ID ${memberId}: update failed — ${error.message}`)
      else result.updated++
    } else {
      const insertPayload = { ...payload, member_id: memberId } as Record<string, unknown>
      const planLabel = membershipPlanLabel(row.membershipMonth)
      if (planLabel) insertPayload.notes = `Requested plan (from intake form): ${planLabel}`
      const { error } = await supabase.from('members').insert(insertPayload)
      if (error) result.errors.push(`Member ID ${memberId}: insert failed — ${error.message}`)
      else result.created++
    }
  }

  result.ok = result.errors.length === 0
  return result
}
