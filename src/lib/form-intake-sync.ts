import { createAdminClient } from '@/lib/supabase/admin'
import { getSheetValues } from '@/lib/google-sheets'
import { revalidateTag, revalidatePath } from 'next/cache'
import { getExpiryDateFromPlan } from '@/lib/utils'

// Pulls new/edited rows from the gym's Google Form intake sheet (a *separate*
// spreadsheet from the one-way backup in sheets-backup.ts — this direction is
// Sheet -> Supabase) and upserts them into members, keyed by the Member ID
// column staff fill in after reviewing each submission.
//
// Sheet columns (Form responses 1): Timestamp, Name, Member ID, Mobile Number,
// Place, JOIN DATE, MEMBERSHIP MONTH. Dates are DD/MM/YYYY (day-first, same
// convention as the rest of this app).
//
// Also creates a real membership for a recognized MEMBERSHIP MONTH value
// (1=Monthly, 3=Quarterly) — these are treated as already paid in cash
// outside the system, so payment_pending is false, but deliberately no
// `payments` row is inserted: revenue/accounts figures should only reflect
// payments actually recorded through the UI, not an automated import.
//
// A later edit to Join Date and/or MEMBERSHIP MONTH is picked up on re-sync
// too — but only while that membership is still exactly as this sync left it
// (the member's only membership row ever). The instant a member has renewed,
// or had their membership corrected in the app, they get a second row and
// this backs off permanently, so a stray sheet edit can never clobber real
// transaction history — see reconcileMembership.

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

// A structured record of the same "skipped due to a data-entry problem" rows
// that also go into `result.warnings` above — persisted to form_intake_issues
// so staff have somewhere durable to look (the Members page's Error Members
// section), not just a toast that's gone the moment someone clicks Sync.
interface IntakeIssue {
  attemptedMemberId: string | null
  name: string | null
  mobile: string | null
  reason: string
}

export async function runFormIntakeSync(): Promise<FormIntakeSyncResult> {
  const result: FormIntakeSyncResult = { ok: false, created: 0, updated: 0, skipped: 0, warnings: [], errors: [] }
  const issues: IntakeIssue[] = []

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
      issues.push({
        attemptedMemberId: memberIdRaw || null,
        name: name ?? null,
        mobile: mobile ?? null,
        reason: memberIdRaw ? `"${memberIdRaw}" isn't a valid Member ID` : 'Member ID is missing',
      })
      continue
    }
    if (!name || !mobile) {
      result.skipped++
      result.warnings.push(`Skipped Member ID ${memberId}: missing name or mobile`)
      issues.push({
        attemptedMemberId: memberIdRaw ?? null,
        name: name ?? null,
        mobile: mobile ?? null,
        reason: !name && !mobile ? 'Missing name and mobile number' : !name ? 'Missing name' : 'Missing mobile number',
      })
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
  const planById = new Map((plans ?? []).map(p => [p.id, p]))

  // The sheet keeps every form submission ever made, so this list only grows —
  // looking each one up individually (1 round trip per row, then another to
  // check for an existing membership) was the whole reason this sync got
  // slower every month. Both lookups are batched into one query each here
  // instead, so the loop below only ever does a round trip when it's actually
  // writing something.
  type MembershipRow = { id: string; member_id: string; plan_id: string; start_date: string }
  type ExistingMember = { id: string; join_date: string | null; full_name: string; mobile: string; address: string | null }
  const allMemberIds = [...byId.keys()]
  const existingByMemberId = new Map<number, ExistingMember>()
  const membershipsByMember = new Map<string, MembershipRow[]>()
  if (allMemberIds.length > 0) {
    const { data: existingMembers } = await supabase
      .from('members')
      .select('id, member_id, join_date, full_name, mobile, address')
      .in('member_id', allMemberIds)
    for (const m of (existingMembers ?? []) as (ExistingMember & { member_id: number })[]) {
      existingByMemberId.set(m.member_id, { id: m.id, join_date: m.join_date, full_name: m.full_name, mobile: m.mobile, address: m.address })
    }

    const existingUuids = [...existingByMemberId.values()].map(m => m.id)
    if (existingUuids.length > 0) {
      const { data: memberships } = await supabase
        .from('memberships')
        .select('id, member_id, plan_id, start_date')
        .in('member_id', existingUuids)
      for (const row of (memberships ?? []) as MembershipRow[]) {
        const list = membershipsByMember.get(row.member_id) ?? []
        list.push(row)
        membershipsByMember.set(row.member_id, list)
      }
    }
  }

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

    const expiryDateStr = getExpiryDateFromPlan(startDate, plan.duration_months)

    const { error } = await supabase.from('memberships').insert({
      member_id: memberUuid,
      plan_id: plan.id,
      start_date: startDate,
      expiry_date: expiryDateStr,
      amount: plan.fee,
      status: 'active',
      payment_pending: false, // treated as already paid in cash — no `payments` row, so this stays out of Accounts
    })
    if (error) result.errors.push(`Member ID ${memberIdForLog}: membership creation failed — ${error.message}`)
  }

  // Corrects a membership's start date and/or plan/expiry to match a
  // since-edited Join Date or MEMBERSHIP MONTH — but only when this member
  // has exactly one membership row, i.e. nothing has touched it since this
  // sync created it (no renewal, no manual correction in the app). The
  // instant a member has any renewal history, this backs off entirely and
  // never touches their membership again, same guarantee as before.
  //
  // Either field can change independently (e.g. just correcting a typo'd
  // Join Date without touching Membership Month), so each falls back to the
  // membership's own current value when the sheet doesn't specify a change
  // for that particular field — this only ever corrects what actually
  // changed, never blanks out the other. If Membership Month is blank/
  // invalid and the membership's current plan isn't one of the two form
  // plans (Monthly/Quarterly), there's no safe duration to recompute an
  // expiry from, so this leaves it untouched rather than guessing.
  async function reconcileMembership(
    membership: MembershipRow,
    memberIdForLog: number,
    newStartDate: string | null,
    plan: { id: string; duration_months: number; fee: number } | undefined
  ): Promise<void> {
    const effectivePlan = plan ?? planById.get(membership.plan_id)
    if (!effectivePlan) return

    const effectiveStart = newStartDate ?? membership.start_date
    const planChanged = effectivePlan.id !== membership.plan_id
    const startChanged = effectiveStart !== membership.start_date
    if (!planChanged && !startChanged) return

    const expiryDateStr = getExpiryDateFromPlan(effectiveStart, effectivePlan.duration_months)

    const { error } = await supabase
      .from('memberships')
      .update({
        plan_id: effectivePlan.id,
        amount: effectivePlan.fee,
        start_date: effectiveStart,
        expiry_date: expiryDateStr,
      })
      .eq('id', membership.id)
    if (error) result.errors.push(`Member ID ${memberIdForLog}: membership update failed — ${error.message}`)
  }

  // Pushed to the device at the end — a targeted insert for just the members
  // that actually need it this run (new, or renamed), not a full "scan every
  // member/attendance/command row" catch-up (that's what made every single
  // Apps Script trigger slow, re-checking ~70 members' device status on
  // every single edit regardless of which row changed). Anyone still missed
  // entirely (e.g. from before this existed) is still caught by the "Bulk
  // Enroll" button on the Biometric page. Re-sending 'enroll' for an
  // existing PIN just updates the device's stored name — it doesn't touch
  // or require re-scanning their fingerprint, which is keyed to the PIN.
  const toPushToDevice: { member_id: number; full_name: string }[] = []

  // Each Member ID is independent (the `byId` grouping above already collapsed
  // any duplicate rows per ID), so these can safely run concurrently instead
  // of waiting for one row's writes to finish before starting the next.
  // Bounded rather than a single unbounded Promise.all so a very large sheet
  // can't fire hundreds of simultaneous requests at Supabase at once.
  async function processMember(memberId: number, entries: ParsedRow[]): Promise<void> {
    const distinctNames = new Set(entries.map(e => e.name.toLowerCase()))
    if (distinctNames.size > 1) {
      result.skipped += entries.length
      result.warnings.push(
        `Skipped Member ID ${memberId}: used by multiple different names in the sheet (${[...distinctNames].join(' / ')}) — fix the duplicate before this can sync`
      )
      const names = [...new Set(entries.map(e => e.name))]
      issues.push({
        attemptedMemberId: String(memberId),
        name: names.join(' / '),
        mobile: entries[entries.length - 1].mobile,
        reason: `Member ID ${memberId} is used by multiple different names in the sheet — someone typed it wrong`,
      })
      return
    }

    // Multiple rows for the same person (re-submission/edit) — the sheet's
    // last row for that ID is authoritative.
    const row = entries[entries.length - 1]
    const existing = existingByMemberId.get(memberId)

    const durationMonths = membershipDurationMonths(row.membershipMonth)
    const plan = durationMonths ? planByDuration.get(durationMonths) : undefined

    const payload: Record<string, unknown> = { full_name: row.name, mobile: row.mobile, address: row.place || null }
    // A blank Join Date on a re-sync must never overwrite an already-known
    // one — only ever set it going from unknown to known.
    if (row.joinDate) payload.join_date = row.joinDate

    if (existing) {
      // Skip the write entirely when nothing actually changed — with the
      // sheet keeping every submission ever made, an edit anywhere re-syncs
      // every row, and unconditionally re-writing all of them (even the ones
      // untouched) was most of why each sync run got slow. This is the only
      // unconditional write in the existing-member path; the membership
      // checks below already have their own change-detection and stay cheap
      // no-ops regardless.
      const addressValue = row.place || null
      const nameChanged = row.name !== existing.full_name
      const changed =
        nameChanged ||
        row.mobile !== existing.mobile ||
        addressValue !== existing.address ||
        (!!row.joinDate && row.joinDate !== existing.join_date)

      if (changed) {
        const { error } = await supabase.from('members').update(payload).eq('member_id', memberId)
        if (error) {
          result.errors.push(`Member ID ${memberId}: update failed — ${error.message}`)
          return
        }
        result.updated++
        // The device stores name against PIN — a name correction here would
        // otherwise silently drift from what's shown at the machine.
        if (nameChanged) toPushToDevice.push({ member_id: memberId, full_name: row.name })
      }

      const memberships = membershipsByMember.get(existing.id) ?? []
      if (memberships.length === 0) {
        // Covers syncing before MEMBERSHIP MONTH was filled in: if this
        // member still has no membership at all, and the sheet now
        // specifies a valid one, create it now instead of silently doing
        // nothing.
        await createMembershipIfNone(existing.id, memberId, row.joinDate ?? existing.join_date, plan)
      } else if (memberships.length === 1) {
        // Covers a corrected Join Date and/or MEMBERSHIP MONTH for a member
        // who hasn't renewed or been manually corrected since — see
        // reconcileMembership for the safety reasoning.
        await reconcileMembership(memberships[0], memberId, row.joinDate, plan)
      }
      return
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
      return
    }
    result.created++
    toPushToDevice.push({ member_id: memberId, full_name: row.name })

    await createMembershipIfNone((inserted as { id: string }).id, memberId, row.joinDate, plan)
  }

  const CONCURRENCY = 10
  const idEntries = [...byId.entries()]
  for (let i = 0; i < idEntries.length; i += CONCURRENCY) {
    const batch = idEntries.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(([memberId, entries]) => processMember(memberId, entries)))
  }

  // Push this run's new/renamed members to the device — errors logged but
  // don't fail the sync itself, same fire-and-forget pattern as
  // pushNewMembersToDevice in members.ts.
  if (toPushToDevice.length > 0) {
    const { error } = await supabase.from('adms_commands').insert(
      toPushToDevice.map(m => ({ operation: 'enroll' as const, member_id: m.member_id, full_name: m.full_name }))
    )
    if (error) console.error('form intake sync: device enroll queue failed —', error.message)
  }

  // Full replace, not an append — this table should only ever reflect the
  // *currently* unresolved rows. Anything fixed in the sheet since the last
  // run simply won't be in `issues` this time and drops out on its own.
  await supabase.from('form_intake_issues').delete().not('id', 'is', null)
  if (issues.length > 0) {
    await supabase.from('form_intake_issues').insert(
      issues.map(i => ({
        attempted_member_id: i.attemptedMemberId,
        name: i.name,
        mobile: i.mobile,
        reason: i.reason,
      }))
    )
  }

  // Without this, the Dashboard/Members pages (both behind unstable_cache,
  // see src/lib/cached-queries.ts) wouldn't pick up what this cron just wrote
  // until their normal 5-minute revalidate window happened to expire —
  // correct in the DB immediately, invisible in the UI for up to 5 minutes.
  if (result.created > 0 || result.updated > 0 || issues.length > 0) {
    revalidateTag('members', {})
    revalidatePath('/members')
    revalidatePath('/dashboard')
  }

  result.ok = result.errors.length === 0
  return result
}
