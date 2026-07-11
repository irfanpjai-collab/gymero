'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { queueMissingEnrollments } from '@/lib/adms-enrollment'
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

export async function bulkEnrollAllMembers(): Promise<{ queued: number; skipped: number; error?: string }> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()
    const result = await queueMissingEnrollments(supabase, profile.user_id)
    revalidatePath('/biometric')
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { queued: 0, skipped: 0, error: message }
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
//
// "Pushed to device" and "fingerprint enrolled" are two genuinely different
// facts (see the members/[id] Biometric card): a member can have their
// PIN/name/access record known to the device (pushed) without ever having
// scanned a finger there yet, and — less commonly — someone can have a
// fingerprint enrolled directly at the machine without ever going through
// our "enroll" push (e.g. a walk-in test enrolled locally by staff). Keeping
// these as separate booleans instead of one merged "enrolled" flag lets the
// UI show that distinction instead of hiding it.
export interface MemberAdmsInfo {
  pushedToDevice: boolean
  fingerprintEnrolled: boolean
  checkIns: BiometricAttendance[]
}

// Used by the member detail page. Under ADMS there's no live "ask the device"
// query like pyzk had — both flags are inferred from history/pushes, not a
// live lookup.
export async function getMemberAdmsInfo(memberId: string): Promise<MemberAdmsInfo> {
  const empty: MemberAdmsInfo = { pushedToDevice: false, fingerprintEnrolled: false, checkIns: [] }
  try {
    const supabase = await createClient()
    const { data: member } = await supabase
      .from('members')
      .select('member_id')
      .eq('id', memberId)
      .maybeSingle()

    if (!member) return empty

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

    // Device-confirmed valid fingerprint template via OPERLOG push (see
    // cdata/route.ts) — direct proof, not an inference.
    const { data: fingerprint } = await supabase
      .from('adms_fingerprints')
      .select('valid')
      .eq('device_user_id', String(member.member_id))
      .eq('valid', true)
      .limit(1)
      .maybeSingle()

    // A successful punch is itself proof the fingerprint works, independent
    // of whether the OPERLOG event for that enrollment was ever captured
    // (e.g. enrolled before adms_fingerprints existed).
    const fingerprintEnrolled = !!fingerprint || checkIns.length > 0

    // "Pushed to device" is purely our own action history — did the CRM tell
    // the device about this PIN, and was that not later reversed by remove.
    const pushedToDevice = lastCommand?.operation === 'enroll' && lastCommand.status === 'done'

    return { pushedToDevice, fingerprintEnrolled, checkIns }
  } catch (err) {
    console.error('getMemberAdmsInfo error:', err)
    return empty
  }
}

export interface MemberAdmsStatus {
  pushedToDevice: boolean
  fingerprintEnrolled: boolean
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
      { data: fingerprints },
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
      supabase.from('adms_fingerprints').select('device_user_id').eq('valid', true),
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

    // Kept as two separate signals rather than one merged "enrolled" flag —
    // see MemberAdmsInfo for why. "fingerprintEnrolled" is device-confirmed
    // (OPERLOG push) or proven by a successful punch; "pushedToDevice" is
    // purely our own push history. "Blocked" reflects the most recent
    // completed block/unblock command; defaults to unblocked if neither ever ran.
    const hasFingerprint = new Set(
      (fingerprints ?? []).map(f => Number(f.device_user_id)).filter(n => !Number.isNaN(n))
    )
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
      ...hasFingerprint,
      ...everPunched,
      ...Object.keys(latestEnrollRemove).map(Number),
      ...Object.keys(latestBlockUnblock).map(Number),
    ])
    const admsStatus: Record<number, MemberAdmsStatus> = {}
    for (const id of statusMemberIds) {
      admsStatus[id] = {
        pushedToDevice: latestEnrollRemove[id] === 'enroll',
        fingerprintEnrolled: hasFingerprint.has(id) || everPunched.has(id),
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

export interface RecentCheckIn {
  memberId: string | null
  memberNumber: number | null
  fullName: string
  timestamp: string
  punch: number
  membershipStatus: 'active' | 'expired' | 'none'
}

// Lean version of getBiometricPageData for the Dashboard's own check-ins
// widget — just today's punches + membership status, not the full device/
// command/member-list payload the Biometric page needs. Deliberately not
// cached: check-ins are inherently "right now" information, and this is
// cheap enough (today's rows only, capped) to just fetch live each time.
export async function getRecentCheckIns(limit = 8): Promise<RecentCheckIn[]> {
  try {
    const supabase = await createClient()
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const { data: attRows, error } = await supabase
      .from('attendance_logs')
      .select(`
        device_user_id, punched_at, punch_type,
        member:members!attendance_logs_member_id_fkey(id, full_name, member_id)
      `)
      .gte('punched_at', dayStart.toISOString())
      .lt('punched_at', dayEnd.toISOString())
      .order('punched_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    type Row = {
      device_user_id: string
      punched_at: string
      punch_type: number | null
      member: { id: string; full_name: string; member_id: number } | null
    }
    const rows = (attRows ?? []) as unknown as Row[]

    // Same "latest membership per member" pattern as getBiometricPageData —
    // status is computed from the member's current membership, not queried
    // per row.
    const memberUuids = [...new Set(rows.map(r => r.member?.id).filter(Boolean))] as string[]
    const { data: memberships } = memberUuids.length
      ? await supabase.from('memberships').select('member_id, status, expiry_date').in('member_id', memberUuids)
      : { data: [] }

    const membershipLookup: Record<string, { status: string; expiry_date: string }> = {}
    for (const m of (memberships ?? []) as { member_id: string; status: string; expiry_date: string }[]) {
      const cur = membershipLookup[m.member_id]
      if (!cur || (m.expiry_date ?? '') > (cur.expiry_date ?? '')) {
        membershipLookup[m.member_id] = { status: m.status, expiry_date: m.expiry_date }
      }
    }
    const today = new Date().toISOString().split('T')[0]

    return rows.map((row) => {
      const mem = row.member ? membershipLookup[row.member.id] : undefined
      const active = !!mem && mem.status === 'active' && mem.expiry_date >= today
      return {
        memberId: row.member?.id ?? null,
        memberNumber: row.member?.member_id ?? null,
        fullName: row.member?.full_name ?? `Member #${row.device_user_id}`,
        timestamp: row.punched_at,
        punch: row.punch_type ?? 0,
        membershipStatus: mem ? (active ? 'active' : 'expired') : 'none',
      }
    })
  } catch (err) {
    console.error('getRecentCheckIns error:', err)
    return []
  }
}
