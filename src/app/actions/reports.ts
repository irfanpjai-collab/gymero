'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidateTag, revalidatePath } from 'next/cache'
import { getCachedReportsMembersAndPayments } from '@/lib/cached-queries'
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

// Members/payments come from a shared cache (see getCachedReportsMembersAndPayments)
// since reads of those tables aren't role-restricted. Salary/expense totals stay on
// the request-scoped, RLS-respecting client and are never cached — those reads are
// admin-only at the RLS layer, so a non-admin viewing this page simply gets 0 back
// for those two figures, not an error; caching them with the service-role client
// used elsewhere in this file would bypass that per-role restriction entirely.
export async function getReportsOverview(): Promise<ReportsOverview> {
  try {
    const supabase = await createClient()

    const [{ members, payments, monthlyRevenue }, { data: salaries }, { data: expenses }] = await Promise.all([
      getCachedReportsMembersAndPayments(),
      supabase.from('staff_salaries').select('status, net_salary'),
      supabase.from('expenses').select('status, amount'),
    ])

    const totalSalaryPaid = (salaries ?? [])
      .filter((s: { status: string }) => s.status === 'paid')
      .reduce((a: number, s: { net_salary: number }) => a + s.net_salary, 0)
    const totalExpensesPaid = (expenses ?? [])
      .filter((e: { status: string }) => e.status === 'paid')
      .reduce((a: number, e: { amount: number }) => a + e.amount, 0)

    return { members, payments, monthlyRevenue, totalSalaryPaid, totalExpensesPaid }
  } catch (err) {
    console.error('getReportsOverview error:', err)
    return EMPTY
  }
}

// Called by TableRealtimeRefresh on the Reports page — busts both tags the
// cached members+payments read is keyed on (staff_salaries/expenses aren't
// cached at all, see getReportsOverview, so no tag needed for those).
export async function revalidateReportsData(): Promise<void> {
  revalidateTag('members', {})
  revalidateTag('payments', {})
  revalidatePath('/reports')
}
