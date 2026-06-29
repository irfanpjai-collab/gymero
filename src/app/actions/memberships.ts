'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { MembershipPlan } from '@/types'

export async function getPlans(): Promise<MembershipPlan[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('membership_plans')
      .select('*')
      .eq('is_active', true)
      .order('duration_months', { ascending: true })

    if (error) throw error

    return (data ?? []) as MembershipPlan[]
  } catch (err) {
    console.error('getPlans error:', err)
    return []
  }
}

export async function createMembership(data: {
  member_id: string
  plan_id: string
  start_date: string
  amount: number
  amount_note?: string
  payment_method: string
}): Promise<{ error?: string; id?: string }> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()

    if (!data.payment_method) {
      throw new Error('Payment method is required — a membership cannot be activated without recording a payment')
    }

    // Fetch plan to calculate expiry_date and check the amount against its fee
    const { data: plan, error: planError } = await supabase
      .from('membership_plans')
      .select('duration_months, fee')
      .eq('id', data.plan_id)
      .single()

    if (planError || !plan) {
      throw new Error('Plan not found')
    }

    const { duration_months: durationMonths, fee } = plan as { duration_months: number; fee: number }

    // Amount differing from the plan's listed fee isn't blocked — staff may
    // have a legitimate reason (discount, partial payment) — but it must be
    // explained, so it's flagged for review instead of indistinguishable from
    // a full-price payment with no trace.
    if (data.amount !== fee && !data.amount_note?.trim()) {
      throw new Error(`Amount (₹${data.amount}) differs from the plan price (₹${fee}) — please add a note explaining why`)
    }

    const startDate = new Date(data.start_date)
    const expiryDate = new Date(startDate)
    expiryDate.setMonth(expiryDate.getMonth() + durationMonths)

    const { data: inserted, error } = await supabase
      .from('memberships')
      .insert({
        member_id: data.member_id,
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
      membership_id: (inserted as { id: string }).id,
      amount: data.amount,
      payment_method: data.payment_method,
      payment_type: 'membership',
      payment_date: data.start_date,
      notes: 'Auto-recorded on membership creation',
      created_by: profile.user_id,
    })
    if (paymentError) throw new Error(`Membership created but payment failed to record: ${paymentError.message}`)

    revalidatePath('/members')
    revalidatePath('/payments')
    return { id: (inserted as { id: string }).id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function renewMembership(
  memberId: string,
  data: {
    plan_id: string;
    start_date: string;
    amount: number;
    amount_note?: string;
    admission_fee?: number;
    payment_method: string;
  }
): Promise<{ error?: string }> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()

    if (!data.payment_method) {
      throw new Error('Payment method is required — a membership cannot be activated without recording a payment')
    }

    // Find the latest active membership so a renewal can't shrink remaining paid time.
    const { data: currentActive } = await supabase
      .from('memberships')
      .select('expiry_date')
      .eq('member_id', memberId)
      .eq('status', 'active')
      .order('expiry_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    const requestedStart = new Date(data.start_date)
    const currentExpiry = currentActive
      ? new Date((currentActive as { expiry_date: string }).expiry_date)
      : null

    // If membership is still active (expiry in the future), extend from that expiry
    // instead of from whatever start_date the client sent — prevents losing paid days
    // on early renewal. A truly lapsed member (expiry already past) keeps the supplied date.
    const effectiveStart =
      currentExpiry && currentExpiry > requestedStart ? currentExpiry : requestedStart
    const effectiveStartStr = effectiveStart.toISOString().slice(0, 10)

    // Mark existing active memberships as expired
    const { error: expireError } = await supabase
      .from('memberships')
      .update({ status: 'expired' })
      .eq('member_id', memberId)
      .eq('status', 'active')

    if (expireError) throw expireError

    // Fetch plan to calculate expiry_date and check the amount against its fee
    const { data: plan, error: planError } = await supabase
      .from('membership_plans')
      .select('duration_months, fee')
      .eq('id', data.plan_id)
      .single()

    if (planError || !plan) {
      throw new Error('Plan not found')
    }

    const { duration_months: durationMonths, fee } = plan as { duration_months: number; fee: number }

    // See createMembership for why this is flagged, not blocked.
    if (data.amount !== fee && !data.amount_note?.trim()) {
      throw new Error(`Amount (₹${data.amount}) differs from the plan price (₹${fee}) — please add a note explaining why`)
    }

    const expiryDate = new Date(effectiveStart)
    expiryDate.setMonth(expiryDate.getMonth() + durationMonths)

    const { data: insertedMembership, error: insertError } = await supabase
      .from('memberships')
      .insert({
        member_id: memberId,
        plan_id: data.plan_id,
        start_date: effectiveStartStr,
        expiry_date: expiryDate.toISOString().slice(0, 10),
        amount: data.amount,
        amount_note: data.amount !== fee ? data.amount_note?.trim() : null,
        status: 'active',
        created_by: profile.user_id,
      })
      .select('id')
      .single()

    if (insertError) throw insertError

    // If admission fee is provided (lapsed member rejoining), update the member record
    if (data.admission_fee && data.admission_fee > 0) {
      const { error: feeError } = await supabase
        .from('members')
        .update({ admission_fee: data.admission_fee })
        .eq('id', memberId)
      if (feeError) throw feeError
    }

    // 1. Membership payment
    const { error: paymentError } = await supabase.from('payments').insert({
      member_id: memberId,
      membership_id: (insertedMembership as { id: string }).id,
      amount: data.amount,
      payment_method: data.payment_method,
      payment_type: 'membership',
      payment_date: effectiveStartStr,
      notes: 'Auto-recorded on membership renewal',
      created_by: profile.user_id,
    })
    if (paymentError) throw new Error(`Membership renewed but payment failed to record: ${paymentError.message}`)

    // 2. Admission fee payment (if applicable)
    if (data.admission_fee && data.admission_fee > 0) {
      const { error: admissionPaymentError } = await supabase.from('payments').insert({
        member_id: memberId,
        amount: data.admission_fee,
        payment_method: data.payment_method,
        payment_type: 'admission',
        payment_date: effectiveStartStr,
        notes: 'Auto-recorded admission fee on membership renewal',
        created_by: profile.user_id,
      })
      if (admissionPaymentError) {
        throw new Error(`Membership renewed but admission fee payment failed to record: ${admissionPaymentError.message}`)
      }
    }

    revalidatePath('/members')
    revalidatePath('/payments')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function updatePlan(
  id: string,
  data: Partial<MembershipPlan>
): Promise<{ error?: string }> {
  try {
    await requireRole(['admin'])
    const supabase = await createClient()

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...updateData } = data

    const { error } = await supabase
      .from('membership_plans')
      .update(updateData)
      .eq('id', id)

    if (error) throw error

    revalidatePath('/memberships')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function createPlan(data: {
  name: string
  duration_months: number
  fee: number
  description?: string
}): Promise<{ error?: string }> {
  try {
    await requireRole(['admin'])
    const supabase = await createClient()

    const { error } = await supabase.from('membership_plans').insert({
      name: data.name,
      duration_months: data.duration_months,
      fee: data.fee,
      description: data.description ?? null,
      is_active: true,
    })

    if (error) throw error

    revalidatePath('/memberships')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function getLastMembershipExpiry(memberId: string): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('memberships')
      .select('expiry_date')
      .eq('member_id', memberId)
      .order('expiry_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data?.expiry_date ?? null
  } catch (err) {
    console.error('getLastMembershipExpiry error:', err)
    return null
  }
}

