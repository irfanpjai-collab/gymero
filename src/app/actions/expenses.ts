'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { syncExpensesSheet } from '@/lib/sheets-backup'

// Plain runtime exports (consts/arrays) don't survive the 'use server'
// client/server boundary — only async functions do. The category list itself
// lives client-side in the page, mirroring how STAFF_TYPES lives in
// salary/page.tsx rather than salary.ts. This stays a type-only export.
export type ExpenseCategory =
  | 'rent' | 'electricity' | 'water' | 'maintenance'
  | 'equipment' | 'supplies' | 'marketing' | 'staff_welfare' | 'other'

export interface Expense {
  id: string
  category: ExpenseCategory
  description: string
  amount: number
  expense_date: string
  payment_method: 'cash' | 'upi' | 'bank_transfer'
  status: 'pending' | 'paid'
  paid_at: string | null
  notes: string | null
  created_at: string
}

export async function getExpenses(month?: string): Promise<Expense[]> {
  try {
    const supabase = await createClient()
    let query = supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })

    if (month) {
      // month format: YYYY-MM
      const start = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
      query = query.gte('expense_date', start).lt('expense_date', nextMonth)
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Expense[]
  } catch (err) {
    console.error('getExpenses error:', err)
    return []
  }
}

export async function createExpense(data: {
  category: ExpenseCategory
  description: string
  amount: number
  expense_date: string
  payment_method?: 'cash' | 'upi' | 'bank_transfer'
  notes?: string
}): Promise<{ error?: string }> {
  try {
    const profile = await requireRole(['admin'])
    const supabase = await createClient()
    const { error } = await supabase.from('expenses').insert({
      category: data.category,
      description: data.description,
      amount: data.amount,
      expense_date: data.expense_date,
      payment_method: data.payment_method ?? 'cash',
      notes: data.notes ?? null,
      status: 'pending',
      created_by: profile.user_id,
    })
    if (error) throw error
    syncExpensesSheet().catch((err) => console.error('[sheets] expenses sync failed:', err))
    revalidatePath('/expenses')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function markExpensePaid(id: string): Promise<{ error?: string }> {
  try {
    await requireRole(['admin'])
    const supabase = await createClient()
    const { error } = await supabase
      .from('expenses')
      .update({ status: 'paid', paid_at: new Date().toISOString().slice(0, 10) })
      .eq('id', id)
    if (error) throw error
    syncExpensesSheet().catch((err) => console.error('[sheets] expenses sync failed:', err))
    revalidatePath('/expenses')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function deleteExpense(id: string): Promise<{ error?: string }> {
  try {
    await requireRole(['admin'])
    const supabase = await createClient()
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) throw error
    syncExpensesSheet().catch((err) => console.error('[sheets] expenses sync failed:', err))
    revalidatePath('/expenses')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
