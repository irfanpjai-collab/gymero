'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { BiometricAttendance } from '@/types'

export interface AdmsDevice {
  serial_number: string
  last_seen: string | null
  ip_address: string | null
}

export interface AdmsCommand {
  id: string
  operation: 'enroll' | 'remove' | 'block' | 'unblock'
  member_id: number
  full_name: string | null
  status: 'pending' | 'sent' | 'done' | 'failed'
  result: string | null
  attempts: number
  created_at: string
  completed_at: string | null
}

// biometric_audit_log's action column is constrained to the original pyzk-era
// vocabulary — kept as-is rather than altering that table, so ADMS operations
// map onto the closest existing category instead of needing a schema change.
function auditAction(op: AdmsCommand['operation']): 'push_members' | 'delete_user' | 'set_access' {
  if (op === 'enroll') return 'push_members'
  if (op === 'remove') return 'delete_user'
  return 'set_access' // block / unblock
}

async function queueCommand(
  operation: AdmsCommand['operation'],
  memberId: number,
  fullName?: string,
): Promise<{ error?: string }> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()

    const { error } = await supabase.from('adms_commands').insert({
      operation,
      member_id: memberId,
      full_name: fullName ?? null,
      requested_by: profile.user_id,
    })
    if (error) throw error

    await supabase.from('biometric_audit_log').insert({
      action: auditAction(operation),
      actor_user_id: profile.user_id,
      target_member: String(memberId),
      details: { operation, via: 'adms_commands' },
      success: true,
    })

    revalidatePath('/biometric')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function queueEnroll(memberId: number, fullName: string) {
  return queueCommand('enroll', memberId, fullName)
}

export async function bulkEnrollAllMembers(): Promise<{ queued: number; error?: string }> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()

    const { data: members, error } = await supabase
      .from('members')
      .select('member_id, full_name')
      .is('deleted_at', null)
      .order('member_id', { ascending: true })

    if (error) throw error
    if (!members || members.length === 0) return { queued: 0 }

    const { error: insertError } = await supabase.from('adms_commands').insert(
      members.map(m => ({
        operation: 'enroll' as const,
        member_id: m.member_id,
        full_name: m.full_name,
        requested_by: profile.user_id,
      }))
    )
    if (insertError) throw insertError

    revalidatePath('/biometric')
    return { queued: members.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { queued: 0, error: message }
  }
}

export async function queueRemove(memberId: number) {
  return queueCommand('remove', memberId)
}

export async function queueBlock(memberId: number) {
  return queueCommand('block', memberId)
}

export async function queueUnblock(memberId: number) {
  return queueCommand('unblock', memberId)
}

// Moved over from the removed biometric.ts — identical query. attendance_logs
// doesn't care whether the pyzk bridge or the ADMS routes wrote to it.
export interface MemberAdmsInfo {
  enrolled: boolean
  checkIns: BiometricAttendance[]
}

// Used by the member detail page. Under ADMS there's no live "ask the device"
// query like pyzk had — "enrolled" is inferred from history: either they've
// successfully scanned at least once, or their most recent enroll command
// completed, and no remove command happened after it.
export async function getMemberAdmsInfo(memberId: string): Promise<MemberAdmsInfo> {
  try {
    const supabase = await createClient()
    const { data: member } = await supabase
      .from('members')
      .select('member_id')
      .eq('id', memberId)
      .maybeSingle()

    if (!member) return { enrolled: false, checkIns: [] }

    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('device_user_id, punched_at, punch_type, status')
      .eq('member_id', memberId)
      .order('punched_at', { ascending: false })
      .limit(200)

    const checkIns: BiometricAttendance[] = (logs ?? []).map(l => ({
      user_id:   l.device_user_id,
      timestamp: l.punched_at,
      status:    l.status ?? 0,
      punch:     l.punch_type ?? 0,
    }))

    const { data: lastCommand } = await supabase
      .from('adms_commands')
      .select('operation, status, created_at')
      .eq('member_id', member.member_id)
      .in('operation', ['enroll', 'remove'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const enrolled = checkIns.length > 0 || (lastCommand?.operation === 'enroll' && lastCommand.status === 'done')

    return { enrolled, checkIns }
  } catch (err) {
    console.error('getMemberAdmsInfo error:', err)
    return { enrolled: false, checkIns: [] }
  }
}

export interface MemberAdmsStatus {
  enrolled: boolean
  blocked: boolean
}

export interface MemberLite {
  id: string
  member_id: number
  full_name: string
}

export interface BiometricPageData {
  devices: AdmsDevice[]
  attendance: BiometricAttendance[]
  members: MemberLite[]
  commands: AdmsCommand[]
  admsStatus: Record<number, MemberAdmsStatus>
}

// Everything the Biometric page needs, in one round trip instead of five —
// each separate server action call is its own client→server request, and on
// Vercel that overhead dwarfs the actual (tiny) query cost at this data
// scale. One shared connection here, fanned out internally instead.
//
// dateStr is a plain "YYYY-MM-DD" (e.g. from an <input type="date">);
// defaults to today. Attendance covers that full calendar day.
export async function getBiometricPageData(dateStr?: string): Promise<BiometricPageData> {
  const empty: BiometricPageData = { devices: [], attendance: [], members: [], commands: [], admsStatus: {} }
  try {
    const supabase = await createClient()
    const dayStart = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date()
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const [
      { data: devices, error: devicesErr },
      { data: attRows, error: attErr },
      { data: members, error: membersErr },
      { data: commands, error: commandsErr },
      { data: doneCommands },
      { data: punches },
    ] = await Promise.all([
      supabase.from('adms_devices').select('*').order('last_seen', { ascending: false }),
      supabase
        .from('attendance_logs')
        .select(`
          device_user_id,
          punched_at,
          punch_type,
          status,
          member:members!attendance_logs_member_id_fkey(id, full_name, member_id)
        `)
        .gte('punched_at', dayStart.toISOString())
        .lt('punched_at', dayEnd.toISOString())
        .order('punched_at', { ascending: false })
        .limit(200),
      supabase.from('members').select('id, member_id, full_name').order('member_id', { ascending: true }),
      supabase.from('adms_commands').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('adms_commands').select('member_id, operation, created_at').eq('status', 'done').order('created_at', { ascending: true }),
      supabase.from('attendance_logs').select('device_user_id'),
    ])
    if (devicesErr) throw devicesErr
    if (attErr) throw attErr
    if (membersErr) throw membersErr
    if (commandsErr) throw commandsErr

    type Row = {
      device_user_id: string
      punched_at: string
      punch_type: number
      status: number | null
      member: { id: string; full_name: string; member_id: number } | null
    }
    const rows = (attRows ?? []) as unknown as Row[]

    const memberUuids = [...new Set(rows.map(r => r.member?.id).filter(Boolean))] as string[]
    const { data: memberships } = memberUuids.length
      ? await supabase.from('memberships').select('member_id, status, expiry_date').in('member_id', memberUuids)
      : { data: [] }

    const membershipLookup: Record<string, { status: string; expiry_date: string }> = {}
    for (const m of memberships ?? []) {
      const cur = membershipLookup[m.member_id]
      if (!cur || (m.expiry_date ?? '') > (cur.expiry_date ?? '')) {
        membershipLookup[m.member_id] = { status: m.status, expiry_date: m.expiry_date }
      }
    }
    const today = new Date().toISOString().split('T')[0]

    const attendance: BiometricAttendance[] = rows.map((row) => {
      const mem = row.member ? membershipLookup[row.member.id] : undefined
      const active = !!mem && mem.status === 'active' && mem.expiry_date >= today
      return {
        user_id:            row.device_user_id,
        timestamp:          row.punched_at,
        status:             row.status ?? 0,
        punch:              row.punch_type ?? 0,
        user_name:          row.member?.full_name,
        crm_id:             row.member?.id,
        membership_status:  mem ? (active ? 'active' : 'expired') : 'none',
        expiry_date:        mem?.expiry_date,
      }
    })

    // "Enrolled" is true if the member has ever punched in, or their most
    // recent completed enroll/remove command was an enroll. "Blocked"
    // reflects the most recent completed block/unblock command; defaults to
    // unblocked if neither ever ran.
    const everPunched = new Set(
      (punches ?? []).map(a => Number(a.device_user_id)).filter(n => !Number.isNaN(n))
    )
    const latestEnrollRemove: Record<number, 'enroll' | 'remove'> = {}
    const latestBlockUnblock: Record<number, 'block' | 'unblock'> = {}
    for (const cmd of doneCommands ?? []) {
      if (cmd.operation === 'enroll' || cmd.operation === 'remove') {
        latestEnrollRemove[cmd.member_id] = cmd.operation
      } else if (cmd.operation === 'block' || cmd.operation === 'unblock') {
        latestBlockUnblock[cmd.member_id] = cmd.operation
      }
    }
    const statusMemberIds = new Set([
      ...everPunched,
      ...Object.keys(latestEnrollRemove).map(Number),
      ...Object.keys(latestBlockUnblock).map(Number),
    ])
    const admsStatus: Record<number, MemberAdmsStatus> = {}
    for (const id of statusMemberIds) {
      admsStatus[id] = {
        enrolled: everPunched.has(id) || latestEnrollRemove[id] === 'enroll',
        blocked: latestBlockUnblock[id] === 'block',
      }
    }

    return {
      devices: (devices ?? []) as AdmsDevice[],
      attendance,
      members: (members ?? []) as MemberLite[],
      commands: (commands ?? []) as AdmsCommand[],
      admsStatus,
    }
  } catch (err) {
    console.error('getBiometricPageData error:', err)
    return empty
  }
}
