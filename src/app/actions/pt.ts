'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { PtPlan } from '@/types'

// PT is tracked entirely separately from the regular membership system —
// renewMembership() expires any existing active membership on renewal, so PT
// can't be sold as just another membership_plans row without cancelling a
// member's regular gym access. See supabase/pt_feature.sql.

export async function getPtPlans(): Promise<PtPlan[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('pt_plans')
      .select('*')
      .eq('is_active', true)
      .order('duration_months', { ascending: true })

    if (error) throw error
    return (data ?? []) as PtPlan[]
  } catch (err) {
    console.error('getPtPlans error:', err)
    return []
  }
}

export async function createPtPlan(data: {
  name: string
  duration_months: number
  fee: number
  description?: string
}): Promise<{ error?: string }> {
  try {
    await requireRole(['admin'])
    const supabase = await createClient()

    const { error } = await supabase.from('pt_plans').insert({
      name: data.name,
      duration_months: data.duration_months,
      fee: data.fee,
      description: data.description ?? null,
      is_active: true,
    })

    if (error) throw error

    revalidateTag('coaches', {})
    revalidatePath('/coaches')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export interface PtClient {
  ptMembershipId: string
  memberId: string
  memberNumber: number
  fullName: string
  mobile: string
  planName: string
  expiryDate: string
  status: 'active' | 'expired' | 'cancelled'
}

// A pt_membership's stored status only flips on renewal/cancellation, not on
// a cron — so "active" here is computed against today's date rather than
// trusted at face value, same reasoning as the regular membership status.
export async function getCoachPtClients(coachId: string): Promise<PtClient[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('pt_memberships')
      .select(`
        id, expiry_date, status,
        member:members!pt_memberships_member_id_fkey(id, member_id, full_name, mobile),
        plan:pt_plans!pt_memberships_plan_id_fkey(name)
      `)
      .eq('coach_id', coachId)
      .order('expiry_date', { ascending: false })

    if (error) throw error

    const todayStr = new Date().toISOString().slice(0, 10)
    type Row = {
      id: string
      expiry_date: string
      status: 'active' | 'expired' | 'cancelled'
      member: { id: string; member_id: number; full_name: string; mobile: string } | null
      plan: { name: string } | null
    }

    return ((data ?? []) as unknown as Row[])
      .filter((row) => row.member)
      .map((row) => ({
        ptMembershipId: row.id,
        memberId: row.member!.id,
        memberNumber: row.member!.member_id,
        fullName: row.member!.full_name,
        mobile: row.member!.mobile,
        planName: row.plan?.name ?? 'PT Plan',
        expiryDate: row.expiry_date,
        status: row.status === 'cancelled' ? 'cancelled' : row.expiry_date >= todayStr ? 'active' : 'expired',
      }))
  } catch (err) {
    console.error('getCoachPtClients error:', err)
    return []
  }
}

export interface MemberPtInfo {
  ptMembershipId: string
  coachId: string | null
  coachName: string | null
  planName: string
  expiryDate: string
  status: 'active' | 'expired' | 'cancelled'
}

// The member detail page only needs the single most recent PT membership —
// same "compute status against today" reasoning as getCoachPtClients.
export async function getMemberPt(memberId: string): Promise<MemberPtInfo | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('pt_memberships')
      .select(`
        id, expiry_date, status,
        coach:coaches!pt_memberships_coach_id_fkey(id, name),
        plan:pt_plans!pt_memberships_plan_id_fkey(name)
      `)
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    type Row = {
      id: string
      expiry_date: string
      status: 'active' | 'expired' | 'cancelled'
      coach: { id: string; name: string } | null
      plan: { name: string } | null
    }
    const row = data as unknown as Row
    const todayStr = new Date().toISOString().slice(0, 10)

    return {
      ptMembershipId: row.id,
      coachId: row.coach?.id ?? null,
      coachName: row.coach?.name ?? null,
      planName: row.plan?.name ?? 'PT Plan',
      expiryDate: row.expiry_date,
      status: row.status === 'cancelled' ? 'cancelled' : row.expiry_date >= todayStr ? 'active' : 'expired',
    }
  } catch (err) {
    console.error('getMemberPt error:', err)
    return null
  }
}

export async function assignPtMembership(data: {
  member_id: string
  coach_id: string
  plan_id: string
  start_date: string
  amount: number
  amount_note?: string
  payment_method: string
}): Promise<{ error?: string }> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()

    if (!data.payment_method) {
      throw new Error('Payment method is required — a PT package cannot be activated without recording a payment')
    }

    const { data: plan, error: planError } = await supabase
      .from('pt_plans')
      .select('duration_months, fee')
      .eq('id', data.plan_id)
      .single()

    if (planError || !plan) throw new Error('PT plan not found')

    const { duration_months: durationMonths, fee } = plan as { duration_months: number; fee: number }

    // See createMembership for why this is flagged, not blocked.
    if (data.amount !== fee && !data.amount_note?.trim()) {
      throw new Error(`Amount (₹${data.amount}) differs from the plan price (₹${fee}) — please add a note explaining why`)
    }

    const startDate = new Date(data.start_date)
    const expiryDate = new Date(startDate)
    expiryDate.setMonth(expiryDate.getMonth() + durationMonths)

    const { data: inserted, error } = await supabase
      .from('pt_memberships')
      .insert({
        member_id: data.member_id,
        coach_id: data.coach_id,
        plan_id: data.plan_id,
        start_date: data.start_date,
        expiry_date: expiryDate.toISOString().slice(0, 10),
        amount: data.amount,
        amount_note: data.amount !== fee ? data.amount_note?.trim() : null,
        status: 'active',
        created_by: profile.user_id,
      })
      .select('id')
      .single()

    if (error) throw error

    const { error: paymentError } = await supabase.from('payments').insert({
      member_id: data.member_id,
      pt_membership_id: (inserted as { id: string }).id,
      amount: data.amount,
      payment_method: data.payment_method,
      payment_type: 'personal_training',
      payment_date: data.start_date,
      notes: 'Auto-recorded on PT package sale',
      created_by: profile.user_id,
    })
    if (paymentError) throw new Error(`PT package created but payment failed to record: ${paymentError.message}`)

    // Selling a PT package implies a coaching relationship — keep the
    // general coach_members link in sync so this member also shows under
    // the coach's regular "View Members" list, not just the PT client list.
    await supabase
      .from('coach_members')
      .upsert({ coach_id: data.coach_id, member_id: data.member_id }, { onConflict: 'coach_id,member_id', ignoreDuplicates: true })

    revalidateTag('coaches', {})
    revalidateTag('payments', {})
    revalidatePath('/coaches')
    revalidatePath('/payments')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function cancelPtMembership(id: string): Promise<{ error?: string }> {
  try {
    await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()

    const { error } = await supabase.from('pt_memberships').update({ status: 'cancelled' }).eq('id', id)
    if (error) throw error

    revalidateTag('coaches', {})
    revalidatePath('/coaches')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
