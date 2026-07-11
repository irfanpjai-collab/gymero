import { unstable_cache } from 'next/cache'
import { createAdminClient } from './supabase/admin'
import { DEFAULT_GRACE_PERIOD_DAYS, getMembershipStatus, pickCurrentMembership } from './utils'
import type { Member, DashboardStats, Payment, MembershipPlan, Coach, PtPlan, Membership, BiometricAttendance } from '@/types'
import type { MemberAdmsInfo } from '@/app/actions/adms'
import type { MemberPtInfo } from '@/app/actions/pt'
import type { MembershipHistoryEntry } from '@/app/actions/memberships'

// Cached DB reads using the admin (service-role) client so they can run
// outside a request context. Tags bust when the corresponding mutations
// call revalidateTag() in the action files.

function escapePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// ── Settings ─────────────────────────────────────────────────────────────────

const _getGracePeriodDays = async (): Promise<number> => {
  const supabase = createAdminClient()
  const { data } = await supabase.from('app_settings').select('grace_period_days').eq('id', 1).maybeSingle()
  return data?.grace_period_days ?? DEFAULT_GRACE_PERIOD_DAYS
}

export const getCachedGracePeriodDays = unstable_cache(
  _getGracePeriodDays,
  ['grace-period-days'],
  { tags: ['settings'], revalidate: 300 }
)

// ── Members ──────────────────────────────────────────────────────────────────

const _getMembers = async (search?: string): Promise<Member[]> => {
  const supabase = createAdminClient()

  let query = supabase
    .from('members')
    .select(`
      *,
      active_membership:memberships!memberships_member_id_fkey(
        id, expiry_date, status, plan_id, start_date, amount, amount_note, payment_pending, created_at
      )
    `)
    .is('deleted_at', null)
    .order('expiry_date', { foreignTable: 'memberships', ascending: false })
    .order('member_id', { ascending: true })

  if (search) {
    const pattern = escapePostgrestValue(`%${search}%`)
    query = query.or(
      `full_name.ilike.${pattern},mobile.ilike.${pattern},member_id.eq.${Number(search) || 0}`
    )
  }

  const { data, error } = await query
  if (error) return []

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const membershipRows = Array.isArray(row.active_membership)
      ? (row.active_membership as unknown as Membership[])
      : row.active_membership
      ? [row.active_membership as Membership]
      : []
    const membership = pickCurrentMembership(membershipRows)
    return { ...row, active_membership: membership } as Member
  })
}

export const getCachedMembers = unstable_cache(
  _getMembers,
  ['members'],
  { tags: ['members'], revalidate: 300 }
)

// ── Dashboard stats ──────────────────────────────────────────────────────────

const _getDashboardStats = async (): Promise<DashboardStats> => {
  const supabase = createAdminClient()
  const gracePeriodDays = await _getGracePeriodDays()
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)

  const [
    totalMembersRes, allMembershipsRes, revenueRes, admissionFeeRes,
  ] = await Promise.all([
    supabase.from('members').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('memberships').select('member_id, expiry_date, status'),
    supabase.from('payments').select('amount').gte('payment_date', firstOfMonth).neq('payment_type', 'admission'),
    supabase.from('payments').select('amount').gte('payment_date', firstOfMonth).eq('payment_type', 'admission'),
  ])

  const revenueThisMonth = ((revenueRes.data ?? []) as { amount: number }[]).reduce((s, p) => s + (p.amount ?? 0), 0)
  const admissionFeeThisMonth = ((admissionFeeRes.data ?? []) as { amount: number }[]).reduce((s, p) => s + (p.amount ?? 0), 0)

  // Counting raw membership rows double-counts members who've renewed —
  // every past renewal cycle leaves behind a superseded 'expired' row, which
  // eventually ages past the grace window and gets counted forever even
  // though the member is currently active. Only each member's most recent
  // (by expiry_date) non-cancelled row reflects their real current status.
  const latestByMember: Record<string, string> = {}
  for (const m of (allMembershipsRes.data ?? []) as { member_id: string; expiry_date: string; status: string }[]) {
    if (m.status === 'cancelled') continue
    if (!latestByMember[m.member_id] || m.expiry_date > latestByMember[m.member_id]) {
      latestByMember[m.member_id] = m.expiry_date
    }
  }

  let activeMembers = 0, expiredMembers = 0, gracePeriodMembers = 0, expiringThisWeek = 0, dueToday = 0
  for (const expiryDate of Object.values(latestByMember)) {
    const status = getMembershipStatus(expiryDate, gracePeriodDays)
    if (status === 'active' || status === 'expiring_soon') activeMembers++
    if (status === 'expiring_soon') expiringThisWeek++
    if (status === 'grace_period') gracePeriodMembers++
    if (status === 'expired') expiredMembers++
    if (expiryDate === todayStr) dueToday++
  }

  return {
    totalMembers: totalMembersRes.count ?? 0,
    activeMembers,
    expiredMembers,
    gracePeriodMembers,
    expiringThisWeek,
    revenueThisMonth,
    admissionFeeThisMonth,
    dueToday,
  }
}

export const getCachedDashboardStats = unstable_cache(
  _getDashboardStats,
  ['dashboard-stats'],
  { tags: ['members', 'payments', 'settings'], revalidate: 300 }
)

// ── Grace period members ─────────────────────────────────────────────────────

const _getGracePeriodMembers = async (
  limit = 10
): Promise<(Member & { expiry_date: string; days_since_expiry: number })[]> => {
  const supabase = createAdminClient()
  const gracePeriodDays = await _getGracePeriodDays()
  const todayStr = new Date().toISOString().slice(0, 10)
  const gracePeriodStart = new Date(Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Candidate rows whose expiry falls in the grace window — but a member may
  // have a newer membership from a later renewal, in which case this row is
  // superseded history, not their current status. Verified below against
  // each candidate's actual latest membership before being kept.
  const { data: candidates, error } = await supabase
    .from('memberships')
    .select(`member_id, expiry_date, member:members!memberships_member_id_fkey(*)`)
    .neq('status', 'cancelled')
    .gte('expiry_date', gracePeriodStart)
    .lt('expiry_date', todayStr)
    .order('expiry_date', { ascending: false })

  if (error) return []

  type CandidateRow = { member_id: string; expiry_date: string; member: Member }
  const rows = (candidates ?? []) as unknown as CandidateRow[]
  if (rows.length === 0) return []

  const memberIds = [...new Set(rows.map((r) => r.member_id))]
  const { data: allMemberships } = await supabase
    .from('memberships')
    .select('member_id, expiry_date, status')
    .in('member_id', memberIds)

  const latestByMember: Record<string, string> = {}
  for (const m of (allMemberships ?? []) as { member_id: string; expiry_date: string; status: string }[]) {
    if (m.status === 'cancelled') continue
    if (!latestByMember[m.member_id] || m.expiry_date > latestByMember[m.member_id]) {
      latestByMember[m.member_id] = m.expiry_date
    }
  }

  const today = new Date(todayStr).getTime()
  const results: (Member & { expiry_date: string; days_since_expiry: number })[] = []
  for (const row of rows) {
    if (latestByMember[row.member_id] !== row.expiry_date) continue
    results.push({
      ...row.member,
      expiry_date: row.expiry_date,
      days_since_expiry: Math.round((today - new Date(row.expiry_date).getTime()) / 86400000),
    })
    if (results.length >= limit) break
  }
  return results
}

export const getCachedGracePeriodMembers = unstable_cache(
  _getGracePeriodMembers,
  ['grace-period-members'],
  { tags: ['members', 'settings'], revalidate: 300 }
)

// ── Expiring members ─────────────────────────────────────────────────────────

const _getExpiringMembers = async (
  days = 7
): Promise<(Member & { expiry_date: string; days_left: number })[]> => {
  const supabase = createAdminClient()
  const todayStr = new Date().toISOString().slice(0, 10)
  const futureStr = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('memberships')
    .select(`expiry_date, member:members!memberships_member_id_fkey(*)`)
    .eq('status', 'active')
    .gte('expiry_date', todayStr)
    .lte('expiry_date', futureStr)
    .order('expiry_date', { ascending: true })
    .limit(10)

  if (error) return []

  const today = new Date(todayStr).getTime()
  return ((data ?? []) as unknown as { expiry_date: string; member: Member }[]).map(
    ({ expiry_date, member }) => ({
      ...member,
      expiry_date,
      days_left: Math.round((new Date(expiry_date).getTime() - today) / 86400000),
    })
  )
}

export const getCachedExpiringMembers = unstable_cache(
  _getExpiringMembers,
  ['expiring-members'],
  { tags: ['members'], revalidate: 300 }
)

// ── Last check-in per member ─────────────────────────────────────────────────
// One query for everyone's most-recent punch rather than per-member lookups.
// Reads the most recent 5000 punches and keeps the first (most recent) row
// per member — plenty of headroom for a single gym's attendance volume, and
// far simpler than a DISTINCT ON view the PostgREST client can't express.
const _getLastCheckIns = async (): Promise<Record<string, string>> => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('member_id, punched_at')
    .not('member_id', 'is', null)
    .order('punched_at', { ascending: false })
    .limit(5000)

  if (error) return {}

  const lastCheckIns: Record<string, string> = {}
  for (const row of (data ?? []) as { member_id: string; punched_at: string }[]) {
    if (!lastCheckIns[row.member_id]) lastCheckIns[row.member_id] = row.punched_at
  }
  return lastCheckIns
}

export const getCachedLastCheckIns = unstable_cache(
  _getLastCheckIns,
  ['last-check-ins'],
  { tags: ['members'], revalidate: 300 }
)

// ── Expired members who still checked in ────────────────────────────────────
// Surfaces punches from members whose membership is currently expired/absent —
// a signal the device's access list is stale (e.g. a block command never
// landed) or a renewal was missed. "Expired" here means as of today, not at
// the moment of the punch — matches the status logic used on the Biometric page.
export interface ExpiredCheckIn {
  id: string
  memberId: string
  memberNumber: number
  fullName: string
  punchedAt: string
  expiryDate: string | null
}

const _getExpiredCheckIns = async (limit = 10): Promise<ExpiredCheckIn[]> => {
  const supabase = createAdminClient()

  const { data: punches, error } = await supabase
    .from('attendance_logs')
    .select(`
      id, punched_at,
      member:members!attendance_logs_member_id_fkey(id, member_id, full_name)
    `)
    .not('member_id', 'is', null)
    .order('punched_at', { ascending: false })
    .limit(300)

  if (error) return []

  type Row = { id: string; punched_at: string; member: { id: string; member_id: number; full_name: string } | null }
  const rows = (punches ?? []) as unknown as Row[]

  const memberIds = [...new Set(rows.map(r => r.member?.id).filter(Boolean))] as string[]
  if (memberIds.length === 0) return []

  const { data: memberships } = await supabase
    .from('memberships')
    .select('member_id, status, expiry_date')
    .in('member_id', memberIds)

  const todayStr = new Date().toISOString().slice(0, 10)
  const latestExpiry: Record<string, { status: string; expiry_date: string }> = {}
  for (const m of (memberships ?? []) as { member_id: string; status: string; expiry_date: string }[]) {
    const cur = latestExpiry[m.member_id]
    if (!cur || m.expiry_date > cur.expiry_date) latestExpiry[m.member_id] = m
  }

  const results: ExpiredCheckIn[] = []
  for (const row of rows) {
    if (!row.member) continue
    const mem = latestExpiry[row.member.id]
    const active = !!mem && mem.status === 'active' && mem.expiry_date >= todayStr
    if (active) continue
    results.push({
      id: row.id,
      memberId: row.member.id,
      memberNumber: row.member.member_id,
      fullName: row.member.full_name,
      punchedAt: row.punched_at,
      expiryDate: mem?.expiry_date ?? null,
    })
    if (results.length >= limit) break
  }
  return results
}

export const getCachedExpiredCheckIns = unstable_cache(
  _getExpiredCheckIns,
  ['expired-check-ins'],
  { tags: ['members'], revalidate: 300 }
)

// ── Payments ─────────────────────────────────────────────────────────────────
// Safe to cache: every mutation that inserts a payment (createMembership,
// renewMembership, recordPayment, assignPtMembership, and the admission-fee
// payment on member creation) already calls revalidateTag('payments') —
// confirmed by grep before adding this, not assumed.

const _getPaymentsList = async (): Promise<Payment[]> => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      member:members!payments_member_id_fkey(id, full_name, member_id, mobile),
      membership:memberships!payments_membership_id_fkey(id, expiry_date, plan:membership_plans(name, duration_months)),
      pt_membership:pt_memberships!payments_pt_membership_id_fkey(id, expiry_date, plan:pt_plans(name, duration_months))
    `)
    .order('payment_date', { ascending: false })
    .limit(100)

  if (error) return []
  return (data ?? []) as unknown as Payment[]
}

export const getCachedPaymentsList = unstable_cache(
  _getPaymentsList,
  ['payments-list'],
  { tags: ['payments'], revalidate: 300 }
)

const _getPaymentsSummary = async (): Promise<{ totalRevenue: number; totalCount: number }> => {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('payments').select('amount')
  if (error) return { totalRevenue: 0, totalCount: 0 }
  const rows = (data ?? []) as { amount: number }[]
  return { totalRevenue: rows.reduce((s, r) => s + r.amount, 0), totalCount: rows.length }
}

export const getCachedPaymentsSummary = unstable_cache(
  _getPaymentsSummary,
  ['payments-summary'],
  { tags: ['payments'], revalidate: 300 }
)

const _getMonthlyRevenue = async (): Promise<{ month: string; revenue: number }[]> => {
  const supabase = createAdminClient()
  const { data: payments, error } = await supabase
    .from('payments')
    .select('payment_date, amount')
    .order('payment_date', { ascending: false })

  if (error) return []

  const monthMap: Record<string, { total: number; minDate: Date }> = {}
  for (const p of (payments ?? []) as { payment_date: string; amount: number }[]) {
    const date = new Date(p.payment_date)
    const key = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    if (!monthMap[key]) monthMap[key] = { total: 0, minDate: date }
    monthMap[key].total += p.amount
  }

  return Object.entries(monthMap)
    .map(([month, { total, minDate }]) => ({ month, revenue: total, _minDate: minDate }))
    .sort((a, b) => b._minDate.getTime() - a._minDate.getTime())
    .slice(0, 12)
    .map(({ month, revenue }) => ({ month, revenue }))
}

export const getCachedMonthlyRevenue = unstable_cache(
  _getMonthlyRevenue,
  ['monthly-revenue'],
  { tags: ['payments'], revalidate: 300 }
)

// ── Membership plans ─────────────────────────────────────────────────────────
// Safe to cache: createPlan/updatePlan both call revalidateTag('memberships')
// (added alongside this).

const _getPlans = async (): Promise<MembershipPlan[]> => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('is_active', true)
    .order('duration_months', { ascending: true })

  if (error) return []
  return (data ?? []) as MembershipPlan[]
}

export const getCachedPlans = unstable_cache(
  _getPlans,
  ['membership-plans'],
  { tags: ['memberships'], revalidate: 300 }
)

// ── Coaches ──────────────────────────────────────────────────────────────────
// Safe to cache: createCoach/updateCoach/assignMember/unassignMember all
// already call revalidateTag('coaches') — confirmed by grep before adding this.

const _getCoaches = async (): Promise<Coach[]> => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('coaches')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) return []
  return (data ?? []) as Coach[]
}

export const getCachedCoaches = unstable_cache(
  _getCoaches,
  ['coaches-list'],
  { tags: ['coaches'], revalidate: 300 }
)

// Same 'coaches' tag as above, deliberately — PT plans are only ever shown
// on the Coaches page, and createPtPlan already revalidates that tag
// (added alongside this) so one tag covers both without a separate one.
const _getPtPlans = async (): Promise<PtPlan[]> => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pt_plans')
    .select('*')
    .eq('is_active', true)
    .order('duration_months', { ascending: true })

  if (error) return []
  return (data ?? []) as PtPlan[]
}

export const getCachedPtPlans = unstable_cache(
  _getPtPlans,
  ['pt-plans'],
  { tags: ['coaches'], revalidate: 300 }
)

// ── Reports ──────────────────────────────────────────────────────────────────
// Members + payments only — deliberately excludes staff_salaries/expenses,
// which are admin-only via RLS (security_hardening.sql). Those two are read
// with the request-scoped client directly in getReportsOverview() instead of
// here, since this cache uses the service-role admin client (bypasses RLS)
// and unstable_cache's result isn't keyed by caller role — caching a
// role-restricted read here would leak it to every other role on a cache hit.
// members/payments SELECT is open to any authenticated user regardless of
// role, so no such risk for this part.

export interface ReportsMembersAndPayments {
  members: Member[]
  payments: Payment[]
  monthlyRevenue: { month: string; revenue: number }[]
}

const _getReportsMembersAndPayments = async (): Promise<ReportsMembersAndPayments> => {
  const supabase = createAdminClient()

  const [{ data: members, error: membersErr }, { data: payments, error: paymentsErr }] = await Promise.all([
    supabase
      .from('members')
      .select(`
        *,
        active_membership:memberships!memberships_member_id_fkey(
          id, expiry_date, status, plan_id, start_date, amount, amount_note, created_at
        )
      `)
      .is('deleted_at', null)
      .order('expiry_date', { foreignTable: 'memberships', ascending: false })
      .order('member_id', { ascending: true }),
    // Unlimited — feeds Total Revenue/Net Profit stats and the full payments
    // Excel export, not just a display list, so it can't be capped the way
    // the Payments page's live transaction table is.
    supabase
      .from('payments')
      .select(`*, member:members!payments_member_id_fkey(id, full_name, member_id)`)
      .order('payment_date', { ascending: false }),
  ])
  if (membersErr || paymentsErr) return { members: [], payments: [], monthlyRevenue: [] }

  const flatMembers = (members ?? []).map((row: Record<string, unknown>) => {
    const membershipRows = Array.isArray(row.active_membership)
      ? (row.active_membership as unknown as Membership[])
      : row.active_membership
      ? [row.active_membership as Membership]
      : []
    const membership = pickCurrentMembership(membershipRows)
    return { ...row, active_membership: membership } as Member
  })

  const monthMap: Record<string, { total: number; minDate: Date }> = {}
  for (const p of (payments ?? []) as { payment_date: string; amount: number }[]) {
    const date = new Date(p.payment_date)
    const key = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    if (!monthMap[key]) monthMap[key] = { total: 0, minDate: date }
    monthMap[key].total += p.amount
  }
  const monthlyRevenue = Object.entries(monthMap)
    .map(([month, { total, minDate }]) => ({ month, revenue: total, _minDate: minDate }))
    .sort((a, b) => b._minDate.getTime() - a._minDate.getTime())
    .slice(0, 12)
    .reverse()
    .map(({ month, revenue }) => ({ month, revenue }))

  return {
    members: flatMembers,
    payments: (payments ?? []) as unknown as Payment[],
    monthlyRevenue,
  }
}

export const getCachedReportsMembersAndPayments = unstable_cache(
  _getReportsMembersAndPayments,
  ['reports-members-payments'],
  { tags: ['members', 'payments'], revalidate: 300 }
)

// ── Member detail page ──────────────────────────────────────────────────────
// Combines what used to be 5 separate uncached round trips (getMember,
// getPayments, getMemberAdmsInfo, getMemberPt, getMembershipHistory) into one
// cached read, keyed per-member (unstable_cache includes the memberId
// argument in its cache key automatically, same as _getMembers(search) above).
// All of members/payments/memberships/pt_memberships/attendance_logs/
// adms_commands/adms_fingerprints are read-open to any authenticated user
// (no role restriction), so the service-role admin client here doesn't bypass
// anything a logged-in coach/receptionist couldn't already read directly —
// unlike the Reports page's salary/expense figures, there's no RLS-leak risk.
// Freshness backed by TableRealtimeRefresh on the member detail page rather
// than exhaustively tagging every mutation path — some writes here come from
// the ADMS device webhook (src/app/api/adms/cdata/route.ts), which has no
// user-initiated revalidateTag call to piggyback on.

export interface MemberDetailData {
  member: Member | null
  payments: Payment[]
  biometric: MemberAdmsInfo
  pt: MemberPtInfo | null
  membershipHistory: MembershipHistoryEntry[]
}

const EMPTY_ADMS_INFO: MemberAdmsInfo = { pushedToDevice: false, fingerprintEnrolled: false, checkIns: [] }

const _getMemberDetail = async (memberId: string): Promise<MemberDetailData> => {
  const supabase = createAdminClient()

  const [
    { data: memberRow },
    { data: paymentRows },
    { data: attendanceRows },
    { data: ptRows },
    { data: historyRows },
  ] = await Promise.all([
    supabase
      .from('members')
      .select(`
        *,
        active_membership:memberships!memberships_member_id_fkey(
          id, expiry_date, status, plan_id, start_date, amount, amount_note, payment_pending, created_at
        )
      `)
      .eq('id', memberId)
      .maybeSingle(),
    supabase
      .from('payments')
      .select(`
        *,
        member:members!payments_member_id_fkey(id, full_name, member_id, mobile),
        membership:memberships!payments_membership_id_fkey(id, expiry_date, plan:membership_plans(name, duration_months)),
        pt_membership:pt_memberships!payments_pt_membership_id_fkey(id, expiry_date, plan:pt_plans(name, duration_months))
      `)
      .eq('member_id', memberId)
      .order('payment_date', { ascending: false })
      .limit(100),
    supabase
      .from('attendance_logs')
      .select('device_user_id, punched_at, punch_type, status')
      .eq('member_id', memberId)
      .order('punched_at', { ascending: false })
      .limit(200),
    supabase
      .from('pt_memberships')
      .select(`
        id, start_date, expiry_date, status,
        coach:coaches!pt_memberships_coach_id_fkey(id, name),
        plan:pt_plans!pt_memberships_plan_id_fkey(name)
      `)
      .eq('member_id', memberId),
    supabase
      .from('memberships')
      .select('id, start_date, expiry_date, amount, amount_note, status, created_at, plan:membership_plans(name)')
      .eq('member_id', memberId)
      .order('start_date', { ascending: false }),
  ])

  if (!memberRow) {
    return { member: null, payments: [], biometric: EMPTY_ADMS_INFO, pt: null, membershipHistory: [] }
  }

  const membershipRows = Array.isArray((memberRow as Record<string, unknown>).active_membership)
    ? ((memberRow as Record<string, unknown>).active_membership as unknown as Membership[])
    : (memberRow as Record<string, unknown>).active_membership
    ? [(memberRow as Record<string, unknown>).active_membership as Membership]
    : []
  const member = { ...memberRow, active_membership: pickCurrentMembership(membershipRows) } as Member

  const checkIns: BiometricAttendance[] = (attendanceRows ?? []).map((l: { device_user_id: string; punched_at: string; status: number | null; punch_type: number | null }) => ({
    user_id: l.device_user_id,
    timestamp: l.punched_at,
    status: l.status ?? 0,
    punch: l.punch_type ?? 0,
  }))

  const memberNumber = (memberRow as unknown as { member_id: number }).member_id
  let pushedToDevice = false
  let fingerprintEnrolled = checkIns.length > 0
  if (memberNumber != null) {
    const [{ data: cmd }, { data: fp }] = await Promise.all([
      supabase
        .from('adms_commands')
        .select('operation, status, created_at')
        .eq('member_id', memberNumber)
        .in('operation', ['enroll', 'remove'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('adms_fingerprints')
        .select('valid')
        .eq('device_user_id', String(memberNumber))
        .eq('valid', true)
        .limit(1)
        .maybeSingle(),
    ])
    pushedToDevice = cmd?.operation === 'enroll' && cmd.status === 'done'
    fingerprintEnrolled = fingerprintEnrolled || !!fp
  }

  type PtRow = {
    id: string
    start_date: string
    expiry_date: string
    status: 'active' | 'expired' | 'cancelled'
    coach: { id: string; name: string } | null
    plan: { name: string } | null
  }
  const ptRowsTyped = (ptRows ?? []) as unknown as PtRow[]
  const currentPt =
    pickCurrentMembership(ptRowsTyped.filter((r) => r.status !== 'cancelled')) ??
    pickCurrentMembership(ptRowsTyped)
  const todayStr = new Date().toISOString().slice(0, 10)
  const pt: MemberPtInfo | null = currentPt
    ? {
        ptMembershipId: currentPt.id,
        coachId: currentPt.coach?.id ?? null,
        coachName: currentPt.coach?.name ?? null,
        planName: currentPt.plan?.name ?? 'PT Plan',
        expiryDate: currentPt.expiry_date,
        status: currentPt.status === 'cancelled' ? 'cancelled' : currentPt.expiry_date >= todayStr ? 'active' : 'expired',
      }
    : null

  const membershipHistory: MembershipHistoryEntry[] = (historyRows ?? []).map((row) => {
    const plan = Array.isArray(row.plan) ? row.plan[0] : row.plan
    return {
      id: row.id,
      planName: (plan as { name: string } | null)?.name ?? 'Unknown Plan',
      startDate: row.start_date,
      expiryDate: row.expiry_date,
      amount: row.amount,
      amountNote: row.amount_note,
      status: row.status,
      createdAt: row.created_at,
    }
  })

  return {
    member,
    payments: (paymentRows ?? []) as unknown as Payment[],
    biometric: { pushedToDevice, fingerprintEnrolled, checkIns },
    pt,
    membershipHistory,
  }
}

export const getCachedMemberDetail = unstable_cache(
  _getMemberDetail,
  ['member-detail'],
  { tags: ['members'], revalidate: 300 }
)
