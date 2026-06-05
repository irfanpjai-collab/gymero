'use server'

import { createClient } from '@/lib/supabase/server'
import type { DashboardStats, Member } from '@/types'

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const supabase = await createClient()

    const today = new Date()
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10)
    const todayStr = today.toISOString().slice(0, 10)
    const weekAheadStr = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    // Grace period: 180 days ago
    const gracePeriodStart = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const [
      totalMembersRes,
      activeMembersRes,
      expiredMembersRes,
      gracePeriodRes,
      expiringThisWeekRes,
      revenueRes,
      admissionFeeRes,
      dueTodayRes,
    ] = await Promise.all([
      supabase.from('members').select('id', { count: 'exact', head: true }),
      supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('expiry_date', todayStr),
      // Truly expired: expired > 180 days ago
      supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'expired')
        .lt('expiry_date', gracePeriodStart),
      // Grace period: expired within last 180 days
      supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'expired')
        .gte('expiry_date', gracePeriodStart)
        .lt('expiry_date', todayStr),
      supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('expiry_date', todayStr)
        .lte('expiry_date', weekAheadStr),
      supabase
        .from('payments')
        .select('amount')
        .gte('payment_date', firstOfMonth)
        .neq('payment_type', 'admission'),
      supabase
        .from('payments')
        .select('amount')
        .gte('payment_date', firstOfMonth)
        .eq('payment_type', 'admission'),
      supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('expiry_date', todayStr),
    ])

    const revenueThisMonth = revenueRes.data
      ? (revenueRes.data as { amount: number }[]).reduce(
          (sum, p) => sum + (p.amount ?? 0),
          0
        )
      : 0

    const admissionFeeThisMonth = admissionFeeRes.data
      ? (admissionFeeRes.data as { amount: number }[]).reduce(
          (sum, p) => sum + (p.amount ?? 0),
          0
        )
      : 0

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
  } catch (err) {
    console.error('getDashboardStats error:', err)
    return {
      totalMembers: 0,
      activeMembers: 0,
      expiredMembers: 0,
      gracePeriodMembers: 0,
      expiringThisWeek: 0,
      revenueThisMonth: 0,
      admissionFeeThisMonth: 0,
      dueToday: 0,
    }
  }
}

export async function getGracePeriodMembers(
  limit = 10
): Promise<(Member & { expiry_date: string; days_since_expiry: number })[]> {
  try {
    const supabase = await createClient()

    const todayStr = new Date().toISOString().slice(0, 10)
    const gracePeriodStart = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const { data, error } = await supabase
      .from('memberships')
      .select(`
        expiry_date,
        member:members!memberships_member_id_fkey(*)
      `)
      .eq('status', 'expired')
      .gte('expiry_date', gracePeriodStart)
      .lt('expiry_date', todayStr)
      .order('expiry_date', { ascending: false })
      .limit(limit)

    if (error) throw error

    const today = new Date(todayStr).getTime()

    return ((data ?? []) as unknown as {
      expiry_date: string
      member: Member
    }[]).map(({ expiry_date, member }) => {
      const expiryMs = new Date(expiry_date).getTime()
      const days_since_expiry = Math.round((today - expiryMs) / (1000 * 60 * 60 * 24))
      return { ...member, expiry_date, days_since_expiry }
    })
  } catch (err) {
    console.error('getGracePeriodMembers error:', err)
    return []
  }
}

export async function getExpiringMembers(
  days = 7
): Promise<(Member & { expiry_date: string; days_left: number })[]> {
  try {
    const supabase = await createClient()

    const todayStr = new Date().toISOString().slice(0, 10)
    const futureStr = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const { data, error } = await supabase
      .from('memberships')
      .select(`
        expiry_date,
        member:members!memberships_member_id_fkey(*)
      `)
      .eq('status', 'active')
      .gte('expiry_date', todayStr)
      .lte('expiry_date', futureStr)
      .order('expiry_date', { ascending: true })
      .limit(10)

    if (error) throw error

    const today = new Date(todayStr).getTime()

    return ((data ?? []) as unknown as {
      expiry_date: string
      member: Member
    }[]).map(({ expiry_date, member }) => {
      const expiryMs = new Date(expiry_date).getTime()
      const days_left = Math.round((expiryMs - today) / (1000 * 60 * 60 * 24))
      return { ...member, expiry_date, days_left }
    })
  } catch (err) {
    console.error('getExpiringMembers error:', err)
    return []
  }
}
