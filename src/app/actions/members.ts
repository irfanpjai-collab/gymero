'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath, revalidateTag } from 'next/cache'
import { syncMembersSheet, syncPaymentsSheet } from '@/lib/sheets-backup'
import type { Member, ImportMemberRow } from '@/types'

// Queues an outbound-only ADMS enroll command — a plain DB insert, nothing
// reaches out to the device at all from here. The device picks it up the next
// time it polls /api/adms/getrequest on its own heartbeat (see supabase/adms.sql
// and src/app/api/adms/getrequest/route.ts). A device that's offline right now
// just means the row sits 'pending' until the device next checks in — no
// retry logic needed on this side, the device's own polling *is* the retry.
async function pushNewMembersToDevice(memberIds: string[], requestedBy?: string): Promise<void> {
  if (memberIds.length === 0) return
  try {
    const supabase = await createClient()
    const { data: members } = await supabase
      .from('members')
      .select('member_id, full_name')
      .in('id', memberIds)

    if (!members || members.length === 0) return

    await supabase.from('adms_commands').insert(
      members.map(m => ({
        operation: 'enroll',
        member_id: m.member_id,
        full_name: m.full_name,
        requested_by: requestedBy ?? null,
      }))
    )
  } catch (err) {
    console.error('Auto-push to device failed:', err)
  }
}

// Same outbound-only queue, for removal. A deleted member's fingerprint must not
// keep working — there's no separate access-sync job under ADMS, so a 'remove'
// command is the only thing that revokes access for a deleted member.
async function removeMemberFromDevice(memberId: number, requestedBy?: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('adms_commands').insert({
      operation: 'remove',
      member_id: memberId,
      requested_by: requestedBy ?? null,
    })
  } catch (err) {
    console.error('Auto-remove from device failed:', err)
  }
}

// PostgREST treats , . : ( ) as filter-grammar separators. Wrapping the value in
// double quotes (escaping backslashes/quotes inside it) stops user search input
// from breaking out into extra .or() clauses.
function escapePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export async function getMembers(search?: string): Promise<Member[]> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('members')
      .select(`
        *,
        active_membership:memberships!memberships_member_id_fkey(
          id, expiry_date, status, plan_id, start_date, amount, amount_note, payment_pending, created_at
        )
      `)
      .is('deleted_at', null)
      .order('expiry_date', { foreignTable: 'memberships', ascending: false })
      .order('member_id', { ascending: true })

    if (search) {
      const pattern = escapePostgrestValue(`%${search}%`)
      query = query.or(
        `full_name.ilike.${pattern},mobile.ilike.${pattern},member_id.eq.${Number(search) || 0}`
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
          id, expiry_date, status, plan_id, start_date, amount, amount_note, payment_pending, created_at
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
    const profile = await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()

    const memberIdRaw = parseInt(data.get('member_id') as string)
    if (!memberIdRaw || memberIdRaw < 1) throw new Error('Member ID is required')

    const joinDate = (data.get('join_date') as string) || new Date().toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    const isToday = joinDate === today

    const payload: Record<string, unknown> = {
      member_id: memberIdRaw,
      full_name: data.get('full_name') as string,
      mobile: data.get('mobile') as string,
      gender: data.get('gender') as string,
      join_date: joinDate,
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

    // Record admission fee only when joining today AND marked as paid now.
    // Backdated entries and "not paid yet" entries skip the payment record.
    const paymentMethod = data.get('payment_method') as string | null
    const paidNow = data.get('paid_now') === 'true'
    if (isToday && paidNow && inserted && admissionFee && parseFloat(admissionFee) > 0 && paymentMethod) {
      await supabase.from('payments').insert({
        member_id: (inserted as { id: string }).id,
        amount: parseFloat(admissionFee),
        payment_method: paymentMethod,
        payment_type: 'admission',
        payment_date: joinDate,
        notes: 'Auto-recorded admission fee on member creation',
      })
    }

    await pushNewMembersToDevice([(inserted as { id: string }).id], profile.user_id)
    syncMembersSheet().catch((err) => console.error('[sheets] members sync failed:', err))
    syncPaymentsSheet().catch((err) => console.error('[sheets] payments sync failed:', err))

    revalidateTag('members', {})
    revalidateTag('payments', {})
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
): Promise<{ error?: string; memberIdChanged?: boolean }> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()

    const payload: Record<string, unknown> = {}

    const fields = ['full_name', 'mobile', 'email', 'address', 'gender', 'join_date', 'notes']
    for (const field of fields) {
      const value = data.get(field) as string | null
      if (value !== null && value !== '') {
        payload[field] = value
      }
    }

    // member_id doubles as the device's fingerprint PIN, so changing it isn't
    // a plain field edit — the device needs the old PIN's user record removed
    // and the new one pushed, and the member has to re-scan their fingerprint
    // physically (the old template doesn't follow the ID change).
    let oldMemberId: number | null = null
    const newMemberIdRaw = data.get('member_id') as string | null
    if (newMemberIdRaw !== null && newMemberIdRaw !== '') {
      const newMemberId = parseInt(newMemberIdRaw, 10)
      if (!newMemberId || newMemberId < 1) throw new Error('Member ID must be a positive number')

      const { data: current } = await supabase.from('members').select('member_id').eq('id', id).single()
      if (current && (current as { member_id: number }).member_id !== newMemberId) {
        oldMemberId = (current as { member_id: number }).member_id
        payload.member_id = newMemberId
      }
    }

    const { error } = await supabase.from('members').update(payload).eq('id', id)

    if (error) {
      if (error.code === '23505') throw new Error(`Member ID ${payload.member_id} is already in use by another member`)
      throw error
    }

    if (oldMemberId !== null) {
      await removeMemberFromDevice(oldMemberId, profile.user_id)
      await pushNewMembersToDevice([id], profile.user_id)
    }

    syncMembersSheet().catch((err) => console.error('[sheets] members sync failed:', err))

    revalidateTag('members', {})
    revalidatePath('/members')
    return { memberIdChanged: oldMemberId !== null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function deleteMember(id: string): Promise<{ error?: string }> {
  try {
    const profile = await requireRole(['admin'])
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('members')
      .select('member_id')
      .eq('id', id)
      .single()

    // Soft delete — a hard delete here cascades to permanently erase the
    // member's entire payment/membership history (both FKs are ON DELETE
    // CASCADE), with no way to recover it. deleted_at is restricted to
    // admin-only via a DB trigger (see accounts_integrity_fixes.sql), not
    // just this requireRole check.
    const { error } = await supabase
      .from('members')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    if (existing) await removeMemberFromDevice((existing as { member_id: number }).member_id, profile.user_id)

    revalidateTag('members', {})
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
  let imported = 0
  const errors: string[] = []
  const newMemberIds: string[] = []

  let supabase: Awaited<ReturnType<typeof createClient>>
  let planMap: Record<string, string> = {}
  let requestedBy: string | undefined
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    requestedBy = profile.user_id
    supabase = await createClient()

    // Fetch all plans once for lookup
    const { data: plans } = await supabase
      .from('membership_plans')
      .select('id, name')

    if (plans) {
      planMap = {}
      for (const plan of plans as { id: string; name: string }[]) {
        planMap[plan.name.toLowerCase()] = plan.id
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { imported: 0, errors: [message] }
  }

  for (const row of rows) {
    try {
      if (!row.member_id) {
        errors.push(`Row ${row.full_name}: Member ID is required`)
        continue
      }

      const memberPayload: Record<string, unknown> = {
        member_id: row.member_id,
        full_name: row.full_name,
        mobile: row.mobile,
        join_date: row.join_date,
        gender: 'male', // default; override if provided
      }

      if (row.address) memberPayload.address = row.address
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
        newMemberIds.push(memberId) // only genuinely new inserts, not re-imported existing members
      }

      // Create membership if expiry_date is provided (amount must be > 0 — DB constraint)
      if (memberId && row.expiry_date) {
        if (!row.amount_paid || row.amount_paid <= 0) {
          errors.push(`Row ${row.member_id ?? row.full_name}: member imported, but membership skipped (amount_paid must be greater than 0)`)
        } else {
          const planId = row.plan_name ? planMap[row.plan_name.toLowerCase()] : null

          // If this row matched an existing member (re-import/bulk update),
          // expire their current active membership first — same invariant
          // renewMembership() enforces — so this import can't leave two
          // simultaneously 'active' rows for one member, which would confuse
          // WhatsApp due-date messaging and any status count keyed on it.
          if (!insertedMember) {
            await supabase
              .from('memberships')
              .update({ status: 'expired' })
              .eq('member_id', memberId)
              .eq('status', 'active')
          }

          const membershipPayload: Record<string, unknown> = {
            member_id: memberId,
            expiry_date: row.expiry_date,
            start_date: row.join_date,
            amount: row.amount_paid,
            status: new Date(row.expiry_date) >= new Date() ? 'active' : 'expired',
          }
          if (planId) membershipPayload.plan_id = planId

          const { error: membershipError } = await supabase.from('memberships').insert(membershipPayload)
          if (membershipError) {
            errors.push(`Row ${row.member_id ?? row.full_name}: member imported, but membership failed (${membershipError.message})`)
          }
        }
      }

      imported++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Row ${row.member_id ?? row.full_name}: ${message}`)
    }
  }

  await pushNewMembersToDevice(newMemberIds, requestedBy)
  syncMembersSheet().catch((err) => console.error('[sheets] members sync failed:', err))

  revalidateTag('members', {})
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
