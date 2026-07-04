import { unstable_cache } from 'next/cache'
import { createAdminClient } from './supabase/admin'
import type { Member, DashboardStats } from '@/types'

// Cached DB reads using the admin (service-role) client so they can run
// outside a request context. Tags bust when the corresponding mutations
// call revalidateTag() in the action files.

function escapePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

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
    const membership = Array.isArray(row.active_membership)
      ? (row.active_membership as unknown[])[0] ?? null
      : row.active_membership
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
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)
  const weekAheadStr = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const gracePeriodStart = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [
    totalMembersRes, activeMembersRes, expiredMembersRes, gracePeriodRes,
    expiringThisWeekRes, revenueRes, admissionFeeRes, dueTodayRes,
  ] = await Promise.all([
    supabase.from('members').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('expiry_date', todayStr),
    supabase.from('memberships').select('id', { count: 'exact', head: true }).neq('status', 'cancelled').lt('expiry_date', gracePeriodStart),
    supabase.from('memberships').select('id', { count: 'exact', head: true }).neq('status', 'cancelled').gte('expiry_date', gracePeriodStart).lt('expiry_date', todayStr),
    supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('expiry_date', todayStr).lte('expiry_date', weekAheadStr),
    supabase.from('payments').select('amount').gte('payment_date', firstOfMonth).neq('payment_type', 'admission'),
    supabase.from('payments').select('amount').gte('payment_date', firstOfMonth).eq('payment_type', 'admission'),
    supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('expiry_date', todayStr),
  ])

  const revenueThisMonth = ((revenueRes.data ?? []) as { amount: number }[]).reduce((s, p) => s + (p.amount ?? 0), 0)
  const admissionFeeThisMonth = ((admissionFeeRes.data ?? []) as { amount: number }[]).reduce((s, p) => s + (p.amount ?? 0), 0)

  return {
    totalMembers: totalMembersRes.count ?? 0,
    activeMembers: activeMembersRes.count ?? 0,
    expiredMembers: expiredMembersRes.count ?? 0,
    gracePeriodMembers: gracePeriodRes.count ?? 0,
    expiringThisWeek: expiringThisWeekRes.count ?? 0,
    revenueThisMonth,
    admissionFeeThisMonth,
    dueToday: dueTodayRes.count ?? 0,
  }
}

export const getCachedDashboardStats = unstable_cache(
  _getDashboardStats,
  ['dashboard-stats'],
  { tags: ['members', 'payments'], revalidate: 300 }
)

// ── Grace period members ─────────────────────────────────────────────────────

const _getGracePeriodMembers = async (
  limit = 10
): Promise<(Member & { expiry_date: string; days_since_expiry: number })[]> => {
  const supabase = createAdminClient()
  const todayStr = new Date().toISOString().slice(0, 10)
  const gracePeriodStart = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('memberships')
    .select(`expiry_date, member:members!memberships_member_id_fkey(*)`)
    .neq('status', 'cancelled')
    .gte('expiry_date', gracePeriodStart)
    .lt('expiry_date', todayStr)
    .order('expiry_date', { ascending: false })
    .limit(limit)

  if (error) return []

  const today = new Date(todayStr).getTime()
  return ((data ?? []) as unknown as { expiry_date: string; member: Member }[]).map(
    ({ expiry_date, member }) => ({
      ...member,
      expiry_date,
      days_since_expiry: Math.round((today - new Date(expiry_date).getTime()) / 86400000),
    })
  )
}

export const getCachedGracePeriodMembers = unstable_cache(
  _getGracePeriodMembers,
  ['grace-period-members'],
  { tags: ['members'], revalidate: 300 }
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
