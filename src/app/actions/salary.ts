'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export interface StaffSalary {
  id: string
  staff_name: string
  staff_type: 'coach' | 'receptionist' | 'admin' | 'other'
  coach_id: string | null
  month: string
  base_salary: number
  bonus: number
  deductions: number
  net_salary: number
  status: 'pending' | 'paid'
  paid_at: string | null
  notes: string | null
  created_at: string
}

export async function getSalaries(month?: string): Promise<StaffSalary[]> {
  try {
    const supabase = await createClient()
    let query = supabase
      .from('staff_salaries')
      .select('*')
      .order('staff_name', { ascending: true })

    if (month) {
      // month format: YYYY-MM
      const start = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
      query = query.gte('month', start).lt('month', nextMonth)
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as StaffSalary[]
  } catch (err) {
    console.error('getSalaries error:', err)
    return []
  }
}

export async function createSalary(data: {
  staff_name: string
  staff_type: string
  coach_id?: string | null
  month: string
  base_salary: number
  bonus?: number
  deductions?: number
  notes?: string
}): Promise<{ error?: string }> {
  try {
    const profile = await requireRole(['admin'])
    const supabase = await createClient()
    const { error } = await supabase.from('staff_salaries').insert({
      staff_name: data.staff_name,
      staff_type: data.staff_type,
      coach_id: data.coach_id ?? null,
      month: `${data.month}-01`,
      base_salary: data.base_salary,
      bonus: data.bonus ?? 0,
      deductions: data.deductions ?? 0,
      notes: data.notes ?? null,
      status: 'pending',
      created_by: profile.user_id,
    })
    if (error) throw error
    revalidatePath('/salary')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function markSalaryPaid(id: string): Promise<{ error?: string }> {
  try {
    await requireRole(['admin'])
    const supabase = await createClient()
    const { error } = await supabase
      .from('staff_salaries')
      .update({ status: 'paid', paid_at: new Date().toISOString().slice(0, 10) })
      .eq('id', id)
    if (error) throw error
    revalidatePath('/salary')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function updateSalary(
  id: string,
  data: Partial<Pick<StaffSalary, 'base_salary' | 'bonus' | 'deductions' | 'notes' | 'status'>>
): Promise<{ error?: string }> {
  try {
    await requireRole(['admin'])
    const supabase = await createClient()
    const { error } = await supabase
      .from('staff_salaries')
      .update(data)
      .eq('id', id)
    if (error) throw error
    revalidatePath('/salary')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function deleteSalary(id: string): Promise<{ error?: string }> {
  try {
    await requireRole(['admin'])
    const supabase = await createClient()
    const { error } = await supabase.from('staff_salaries').delete().eq('id', id)
    if (error) throw error
    revalidatePath('/salary')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
