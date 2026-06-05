'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface DueMember {
  id: string
  member_id: number
  full_name: string
  mobile: string
  expiry_date: string
  amount: number
  type: 'due_today' | 'due_in_3_days'
}

export interface ExpiredMember {
  id: string
  member_id: number
  full_name: string
  mobile: string
  expiry_date: string
  amount: number
}

export async function getDueMembers(filter: 'today' | '3days' | 'all' = 'all'): Promise<DueMember[]> {
  try {
    const supabase = await createClient()

    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const in3DaysStr = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    let query = supabase
      .from('memberships')
      .select(`
        expiry_date,
        amount,
        member:members!memberships_member_id_fkey(
          id, member_id, full_name, mobile
        )
      `)
      .eq('status', 'active')
      .order('expiry_date', { ascending: true })

    if (filter === 'today') {
      query = query.eq('expiry_date', todayStr)
    } else if (filter === '3days') {
      query = query.gt('expiry_date', todayStr).lte('expiry_date', in3DaysStr)
    } else {
      query = query.gte('expiry_date', todayStr).lte('expiry_date', in3DaysStr)
    }

    const { data, error } = await query

    if (error) throw error

    const results: DueMember[] = []
    for (const row of (data ?? []) as unknown as {
      expiry_date: string
      amount: number
      member: { id: string; member_id: number; full_name: string; mobile: string }
    }[]) {
      if (!row.member) continue
      results.push({
        id: row.member.id,
        member_id: row.member.member_id,
        full_name: row.member.full_name,
        mobile: row.member.mobile,
        expiry_date: row.expiry_date,
        amount: row.amount,
        type: row.expiry_date === todayStr ? 'due_today' : 'due_in_3_days',
      })
    }

    return results
  } catch (err) {
    console.error('getDueMembers error:', err)
    return []
  }
}

export async function getExpiredMembers(): Promise<ExpiredMember[]> {
  try {
    const supabase = await createClient()

    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const thirtyDaysAgoStr = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const { data, error } = await supabase
      .from('memberships')
      .select(`
        expiry_date,
        amount,
        member:members!memberships_member_id_fkey(
          id, member_id, full_name, mobile
        )
      `)
      .eq('status', 'expired')
      .gte('expiry_date', thirtyDaysAgoStr)
      .lt('expiry_date', todayStr)
      .order('expiry_date', { ascending: false })

    if (error) throw error

    const results: ExpiredMember[] = []
    for (const row of (data ?? []) as unknown as {
      expiry_date: string
      amount: number
      member: { id: string; member_id: number; full_name: string; mobile: string }
    }[]) {
      if (!row.member) continue
      results.push({
        id: row.member.id,
        member_id: row.member.member_id,
        full_name: row.member.full_name,
        mobile: row.member.mobile,
        expiry_date: row.expiry_date,
        amount: row.amount,
      })
    }

    return results
  } catch (err) {
    console.error('getExpiredMembers error:', err)
    return []
  }
}

export async function logWhatsAppMessage(
  memberId: string,
  phone: string,
  message: string,
  type: string
): Promise<void> {
  try {
    const supabase = await createClient()

    await supabase.from('whatsapp_logs').insert({
      member_id: memberId,
      phone,
      message,
      message_type: type,
      sent_at: new Date().toISOString(),
      status: 'sent',
    })

    revalidatePath('/whatsapp')
  } catch (err) {
    console.error('logWhatsAppMessage error:', err)
  }
}
