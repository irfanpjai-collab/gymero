'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { logAudit, actorFromProfile } from '@/lib/audit-log'

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

    // status='expired' only ever gets set when a *later* renewal explicitly
    // supersedes a membership — someone who simply never renewed keeps
    // status='active' forever with nobody flipping it, so filtering on
    // status alone missed the overwhelming majority of "actually expired"
    // members.
    //
    // Querying the memberships table directly by date range isn't enough
    // either: a member who *has* since renewed still has their old,
    // now-superseded row sitting there with a past expiry_date, which would
    // wrongly nag someone who already paid. So this fetches each member's
    // MOST RECENT membership (same "latest by expiry_date" convention as
    // active_membership elsewhere — see getMembers()) and only flags them if
    // that current one, not some earlier superseded one, is the one that
    // recently lapsed.
    const { data, error } = await supabase
      .from('members')
      .select(`
        id, member_id, full_name, mobile,
        memberships!memberships_member_id_fkey(expiry_date, amount)
      `)
      .is('deleted_at', null)
      .order('expiry_date', { foreignTable: 'memberships', ascending: false })

    if (error) throw error

    type Row = {
      id: string; member_id: number; full_name: string; mobile: string
      memberships: { expiry_date: string; amount: number }[] | { expiry_date: string; amount: number } | null
    }

    const results: ExpiredMember[] = []
    for (const row of (data ?? []) as unknown as Row[]) {
      const latest = Array.isArray(row.memberships) ? row.memberships[0] : row.memberships
      if (!latest) continue
      if (latest.expiry_date < thirtyDaysAgoStr || latest.expiry_date >= todayStr) continue

      results.push({
        id: row.id,
        member_id: row.member_id,
        full_name: row.full_name,
        mobile: row.mobile,
        expiry_date: latest.expiry_date,
        amount: latest.amount,
      })
    }

    results.sort((a, b) => b.expiry_date.localeCompare(a.expiry_date))
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
    const profile = await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()

    const { data: inserted } = await supabase.from('whatsapp_logs').insert({
      member_id: memberId,
      phone,
      message,
      message_type: type,
      sent_at: new Date().toISOString(),
      status: 'sent',
    }).select('id').single()

    const { data: memberForLog } = await supabase.from('members').select('full_name').eq('id', memberId).maybeSingle()
    await logAudit(actorFromProfile(profile), 'create', 'whatsapp_message', (inserted as { id: string } | null)?.id ?? null, memberForLog?.full_name ?? null, {
      message_type: type, phone,
    })

    revalidatePath('/whatsapp')
  } catch (err) {
    console.error('logWhatsAppMessage error:', err)
  }
}
