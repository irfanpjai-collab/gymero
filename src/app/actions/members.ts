'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Member, ImportMemberRow } from '@/types'

export async function getMembers(search?: string): Promise<Member[]> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('members')
      .select(`
        *,
        active_membership:memberships!memberships_member_id_fkey(
          id, expiry_date, status, plan_id, start_date, amount, created_at
        )
      `)
      .order('expiry_date', { foreignTable: 'memberships', ascending: false })
      .order('member_id', { ascending: true })

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,mobile.ilike.%${search}%,member_id.eq.${Number(search) || 0}`
      )
    }

    const { data, error } = await query

    if (error) throw error

    // Flatten active_membership: take first active membership if array
    const members = (data ?? []).map((row: Record<string, unknown>) => {
      const membership = Array.isArray(row.active_membership)
        ? (row.active_membership as unknown[])[0] ?? null
        : row.active_membership
      return { ...row, active_membership: membership } as Member
    })

    return members
  } catch (err) {
    console.error('getMembers error:', err)
    return []
  }
}

export async function getMember(id: string): Promise<Member | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('members')
      .select(`
        *,
        active_membership:memberships!memberships_member_id_fkey(
          id, expiry_date, status, plan_id, start_date, amount, created_at
        )
      `)
      .eq('id', id)
      .order('expiry_date', { foreignTable: 'memberships', ascending: false })
      .single()

    if (error) throw error

    if (!data) return null

    const membership = Array.isArray(data.active_membership)
      ? (data.active_membership as unknown[])[0] ?? null
      : data.active_membership

    return { ...(data as Record<string, unknown>), active_membership: membership } as Member
  } catch (err) {
    console.error('getMember error:', err)
    return null
  }
}

export async function createMember(
  data: FormData
): Promise<{ error?: string; memberId?: string }> {
  try {
    const supabase = await createClient()

    // Get next member_id
    const { data: maxData, error: maxError } = await supabase
      .from('members')
      .select('member_id')
      .order('member_id', { ascending: false })
      .limit(1)
      .single()

    let nextMemberId: number
    if (maxError || !maxData) {
      nextMemberId = 100
    } else {
      nextMemberId = (maxData.member_id as number) + 1
    }

    const payload: Record<string, unknown> = {
      member_id: nextMemberId,
      full_name: data.get('full_name') as string,
      mobile: data.get('mobile') as string,
      gender: data.get('gender') as string,
      join_date: (data.get('join_date') as string) || new Date().toISOString().slice(0, 10),
    }

    const email = data.get('email') as string | null
    if (email) payload.email = email

    const address = data.get('address') as string | null
    if (address) payload.address = address

    const admissionFee = data.get('admission_fee') as string | null
    if (admissionFee && parseFloat(admissionFee) > 0) {
      payload.admission_fee = parseFloat(admissionFee)
    }

    const notes = data.get('notes') as string | null
    if (notes) payload.notes = notes

    const { data: inserted, error } = await supabase
      .from('members')
      .insert(payload)
      .select('id')
      .single()

    if (error) throw error

    // Auto-record admission fee payment if payment_method is provided
    const paymentMethod = data.get('payment_method') as string | null
    if (inserted && admissionFee && parseFloat(admissionFee) > 0 && paymentMethod) {
      await supabase.from('payments').insert({
        member_id: (inserted as { id: string }).id,
        amount: parseFloat(admissionFee),
        payment_method: paymentMethod,
        payment_type: 'admission',
        payment_date: payload.join_date,
        notes: 'Auto-recorded admission fee on member creation',
      })
    }

    revalidatePath('/members')
    revalidatePath('/payments')
    return { memberId: (inserted as { id: string }).id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function updateMember(
  id: string,
  data: FormData
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient()

    const payload: Record<string, unknown> = {}

    const fields = ['full_name', 'mobile', 'email', 'address', 'gender', 'join_date', 'notes']
    for (const field of fields) {
      const value = data.get(field) as string | null
      if (value !== null && value !== '') {
        payload[field] = value
      }
    }

    const { error } = await supabase.from('members').update(payload).eq('id', id)

    if (error) throw error

    revalidatePath('/members')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function deleteMember(id: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from('members').delete().eq('id', id)

    if (error) throw error

    revalidatePath('/members')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function importMembers(
  rows: ImportMemberRow[]
): Promise<{ imported: number; errors: string[] }> {
  const supabase = await createClient()
  let imported = 0
  const errors: string[] = []

  // Fetch all plans once for lookup
  const { data: plans } = await supabase
    .from('membership_plans')
    .select('id, name')

  const planMap: Record<string, string> = {}
  if (plans) {
    for (const plan of plans as { id: string; name: string }[]) {
      planMap[plan.name.toLowerCase()] = plan.id
    }
  }

  for (const row of rows) {
    try {
      const memberPayload: Record<string, unknown> = {
        full_name: row.full_name,
        mobile: row.mobile,
        join_date: row.join_date ?? new Date().toISOString().slice(0, 10),
        gender: 'male', // default; override if provided
      }

      if (row.member_id) memberPayload.member_id = row.member_id
      if (row.notes) memberPayload.notes = row.notes

      const { data: insertedMember, error: memberError } = await supabase
        .from('members')
        .upsert(memberPayload, { onConflict: 'member_id', ignoreDuplicates: true })
        .select('id')
        .single()

      if (memberError && memberError.code !== '23505') {
        errors.push(`Row ${row.member_id ?? row.full_name}: ${memberError.message}`)
        continue
      }

      // If skipped due to conflict, fetch existing
      let memberId: string | null = null
      if (!insertedMember) {
        if (row.member_id) {
          const { data: existing } = await supabase
            .from('members')
            .select('id')
            .eq('member_id', row.member_id)
            .single()
          memberId = existing ? (existing as { id: string }).id : null
        }
      } else {
        memberId = (insertedMember as { id: string }).id
      }

      // Create membership if expiry_date is provided
      if (memberId && row.expiry_date) {
        const planId = row.plan_name ? planMap[row.plan_name.toLowerCase()] : null

        const membershipPayload: Record<string, unknown> = {
          member_id: memberId,
          expiry_date: row.expiry_date,
          start_date: row.join_date ?? new Date().toISOString().slice(0, 10),
          amount: row.amount_paid ?? 0,
          status: new Date(row.expiry_date) >= new Date() ? 'active' : 'expired',
        }
        if (planId) membershipPayload.plan_id = planId

        await supabase.from('memberships').insert(membershipPayload)
      }

      imported++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Row ${row.member_id ?? row.full_name}: ${message}`)
    }
  }

  revalidatePath('/members')
  return { imported, errors }
}

export async function getNextMemberId(): Promise<number> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('members')
      .select('member_id')
      .order('member_id', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return 100

    return (data as { member_id: number }).member_id + 1
  } catch {
    return 100
  }
}
