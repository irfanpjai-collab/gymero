'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath, revalidateTag } from 'next/cache'
import { syncPaymentsSheet } from '@/lib/sheets-backup'
import type { Payment } from '@/types'

export async function getPayments(memberId?: string): Promise<Payment[]> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('payments')
      .select(`
        *,
        member:members!payments_member_id_fkey(
          id, full_name, member_id, mobile
        ),
        membership:memberships!payments_membership_id_fkey(
          id, expiry_date, plan:membership_plans(name, duration_months)
        ),
        pt_membership:pt_memberships!payments_pt_membership_id_fkey(
          id, expiry_date, plan:pt_plans(name, duration_months)
        )
      `)
      .order('payment_date', { ascending: false })
      .limit(100)

    if (memberId) {
      query = query.eq('member_id', memberId)
    }

    const { data, error } = await query

    if (error) throw error

    return (data ?? []) as unknown as Payment[]
  } catch (err) {
    console.error('getPayments error:', err)
    return []
  }
}

// getPayments() is capped at 100 rows for the transaction list display — but
// "Total Collected" and similar all-time stats must never be derived from
// that capped list, or they silently understate reality once a gym passes
// 100 lifetime payments. This fetches only the amount column, unlimited.
export async function getPaymentsSummary(): Promise<{ totalRevenue: number; totalCount: number }> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('payments').select('amount')
    if (error) throw error
    const rows = (data ?? []) as { amount: number }[]
    return { totalRevenue: rows.reduce((s, r) => s + r.amount, 0), totalCount: rows.length }
  } catch (err) {
    console.error('getPaymentsSummary error:', err)
    return { totalRevenue: 0, totalCount: 0 }
  }
}

export async function recordPayment(data: {
  member_id: string
  membership_id?: string
  amount: number
  payment_method: string
  payment_type?: string
  payment_date: string
  notes?: string
}): Promise<{ error?: string; payment?: Payment }> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()

    const payload: Record<string, unknown> = {
      member_id: data.member_id,
      amount: data.amount,
      payment_method: data.payment_method,
      payment_type: data.payment_type || 'membership',
      payment_date: data.payment_date,
      created_by: profile.user_id,
    }

    if (data.membership_id) payload.membership_id = data.membership_id
    if (data.notes) payload.notes = data.notes

    const { data: inserted, error } = await supabase
      .from('payments')
      .insert(payload)
      .select('*')
      .single()

    if (error) throw error

    syncPaymentsSheet().catch((err) => console.error('[sheets] payments sync failed:', err))
    revalidateTag('payments', {})
    revalidatePath('/payments')
    return { payment: inserted as Payment }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function getMonthlyRevenue(): Promise<{ month: string; revenue: number }[]> {
  try {
    const supabase = await createClient()

    // Use rpc for aggregate SQL; fall back to manual grouping if not available
    const { data, error } = await supabase.rpc('get_monthly_revenue')

    if (!error && data) {
      return data as { month: string; revenue: number }[]
    }

    // Fallback: fetch raw payments and group in JS
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('payment_date, amount')
      .order('payment_date', { ascending: false })

    if (paymentsError) throw paymentsError

    const monthMap: Record<string, { total: number; minDate: Date }> = {}

    for (const p of (payments ?? []) as { payment_date: string; amount: number }[]) {
      const date = new Date(p.payment_date)
      const key = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      if (!monthMap[key]) {
        monthMap[key] = { total: 0, minDate: date }
      }
      monthMap[key].total += p.amount
    }

    const result = Object.entries(monthMap)
      .map(([month, { total, minDate }]) => ({ month, revenue: total, _minDate: minDate }))
      .sort((a, b) => b._minDate.getTime() - a._minDate.getTime())
      .slice(0, 12)
      .map(({ month, revenue }) => ({ month, revenue }))

    return result
  } catch (err) {
    console.error('getMonthlyRevenue error:', err)
    return []
  }
}

// Called by TableRealtimeRefresh whenever it detects any change to the
// payments table, regardless of source — the safety net for the cached
// Payments page independent of whether the mutation that wrote the row
// remembered to call revalidateTag itself.
export async function revalidatePaymentsData(): Promise<void> {
  revalidateTag('payments', {})
  revalidatePath('/payments')
}
