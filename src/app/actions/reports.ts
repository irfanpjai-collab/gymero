'use server'

import { createClient } from '@/lib/supabase/server'
import type { Member, Payment } from '@/types'

export interface ReportsOverview {
  members: Member[]
  payments: Payment[]
  monthlyRevenue: { month: string; revenue: number }[]
  totalSalaryPaid: number
  totalExpensesPaid: number
}

const EMPTY: ReportsOverview = {
  members: [], payments: [], monthlyRevenue: [], totalSalaryPaid: 0, totalExpensesPaid: 0,
}

// One round trip instead of five separate server-action calls — same fix
// already applied to the Biometric and Accounts pages. Salary/expense reads
// are admin-only at the RLS layer, so a non-admin viewing this page simply
// gets 0 back for those two figures, not an error.
export async function getReportsOverview(): Promise<ReportsOverview> {
  try {
    const supabase = await createClient()

    const [
      { data: members, error: membersErr },
      { data: payments, error: paymentsErr },
      { data: salaries },
      { data: expenses },
    ] = await Promise.all([
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
      // Unlimited — this feeds Total Revenue/Net Profit stats and the full
      // payments Excel export, not just a display list, so it can't be capped
      // the way the Payments page's live transaction table is.
      supabase
        .from('payments')
        .select(`*, member:members!payments_member_id_fkey(id, full_name, member_id)`)
        .order('payment_date', { ascending: false }),
      supabase.from('staff_salaries').select('status, net_salary'),
      supabase.from('expenses').select('status, amount'),
    ])
    if (membersErr) throw membersErr
    if (paymentsErr) throw paymentsErr

    const flatMembers = (members ?? []).map((row: Record<string, unknown>) => {
      const membership = Array.isArray(row.active_membership)
        ? (row.active_membership as unknown[])[0] ?? null
        : row.active_membership
      return { ...row, active_membership: membership } as Member
    })

    // Monthly revenue, last 12 months — mirrors getMonthlyRevenue()'s fallback
    // grouping logic in payments.ts.
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

    const totalSalaryPaid = (salaries ?? [])
      .filter((s: { status: string }) => s.status === 'paid')
      .reduce((a: number, s: { net_salary: number }) => a + s.net_salary, 0)
    const totalExpensesPaid = (expenses ?? [])
      .filter((e: { status: string }) => e.status === 'paid')
      .reduce((a: number, e: { amount: number }) => a + e.amount, 0)

    return {
      members: flatMembers,
      payments: (payments ?? []) as unknown as Payment[],
      monthlyRevenue,
      totalSalaryPaid,
      totalExpensesPaid,
    }
  } catch (err) {
    console.error('getReportsOverview error:', err)
    return EMPTY
  }
}
