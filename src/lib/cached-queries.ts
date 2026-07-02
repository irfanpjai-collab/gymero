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
