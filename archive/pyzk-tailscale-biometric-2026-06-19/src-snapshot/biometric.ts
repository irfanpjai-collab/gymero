'use server'

import {
  BiometricStatus,
  BiometricUser,
  BiometricAttendance,
  BiometricSyncResult,
  BiometricAccessRow,
  BiometricAccessSyncResult,
  BiometricPushStatus,
  BiometricPushResult,
} from '@/types'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

const AI_URL = process.env.AI_MONITOR_URL ?? 'http://localhost:8000'
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY ?? ''

// Records who triggered a device-control action and whether it succeeded — the
// bridge's own logs only see a shared API key, not a CRM user identity, so this
// has to be written from here, where the logged-in user is known.
async function logBiometricAction(
  action: 'unlock' | 'push_members' | 'delete_user' | 'set_access',
  actorUserId: string,
  target: string,
  details: Record<string, unknown>,
  success: boolean,
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('biometric_audit_log').insert({
      action, actor_user_id: actorUserId, target_member: target, details, success,
    })
  } catch (err) {
    console.error('biometric audit log failed:', err)
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetch(`${AI_URL}${path}`, {
      ...init,
      headers: { ...init?.headers, 'X-Bridge-Key': BRIDGE_API_KEY },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  const res = await apiFetch<BiometricStatus>('/api/biometric/status')
  return res ?? { connected: false, error: 'Python server unreachable' }
}

export async function getBiometricUsers(): Promise<BiometricUser[]> {
  const res = await apiFetch<BiometricUser[]>('/api/biometric/users')
  return res ?? []
}

export async function getBiometricAttendance(): Promise<BiometricAttendance[]> {
  const records = await apiFetch<BiometricAttendance[]>('/api/biometric/attendance?limit=1000')
  if (!records || records.length === 0) return []

  // Device user_id is the member's human-readable member_id (e.g. "1001"), not the
  // CRM UUID — resolve it to the UUID first for the membership lookup and for linking.
  const deviceUserIds = [...new Set(records.map(r => r.user_id).filter(Boolean))]
  const numericIds = deviceUserIds.map(Number).filter(n => !isNaN(n))

  const supabase = await createClient()
  const { data: matchedMembers } = numericIds.length
    ? await supabase.from('members').select('id, member_id').in('member_id', numericIds)
    : { data: [] }

  const crmIdByDeviceId: Record<string, string> = {}
  for (const m of matchedMembers ?? []) crmIdByDeviceId[String(m.member_id)] = m.id

  const memberUuids = Object.values(crmIdByDeviceId)
  const { data: memberships } = memberUuids.length
    ? await supabase.from('memberships').select('member_id, status, expiry_date').in('member_id', memberUuids)
    : { data: [] }

  // Keep the latest-expiry membership per member
  const lookup: Record<string, { status: string; expiry_date: string }> = {}
  for (const m of memberships ?? []) {
    const cur = lookup[m.member_id]
    if (!cur || (m.expiry_date ?? '') > (cur.expiry_date ?? '')) {
      lookup[m.member_id] = { status: m.status, expiry_date: m.expiry_date }
    }
  }

  const today = new Date().toISOString().split('T')[0]

  return records.map(r => {
    const crmId = crmIdByDeviceId[r.user_id]
    const mem = crmId ? lookup[crmId] : undefined
    if (!mem) return { ...r, crm_id: crmId, membership_status: 'none' as const }
    const active = mem.status === 'active' && mem.expiry_date >= today
    return {
      ...r,
      crm_id:             crmId,
      membership_status: active ? 'active' as const : 'expired' as const,
      expiry_date:       mem.expiry_date,
    }
  })
}

// Seeds the live-feed UI from the durable attendance_logs table (not the device),
// so a page reload shows today's punches instead of an empty feed that only fills
// back up as new live punches happen to arrive.
export async function getTodaysAttendanceLog(): Promise<BiometricAttendance[]> {
  try {
    const supabase = await createClient()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('attendance_logs')
      .select(`
        device_user_id,
        punched_at,
        punch_type,
        status,
        member:members!attendance_logs_member_id_fkey(id, full_name, member_id)
      `)
      .gte('punched_at', todayStart.toISOString())
      .order('punched_at', { ascending: false })
      .limit(200)

    if (error) throw error

    type Row = {
      device_user_id: string
      punched_at: string
      punch_type: number
      status: number | null
      member: { id: string; full_name: string; member_id: number } | null
    }
    const rows = (data ?? []) as unknown as Row[]

    const memberUuids = [...new Set(rows.map(r => r.member?.id).filter(Boolean))] as string[]
    const { data: memberships } = memberUuids.length
      ? await supabase.from('memberships').select('member_id, status, expiry_date').in('member_id', memberUuids)
      : { data: [] }

    const lookup: Record<string, { status: string; expiry_date: string }> = {}
    for (const m of memberships ?? []) {
      const cur = lookup[m.member_id]
      if (!cur || (m.expiry_date ?? '') > (cur.expiry_date ?? '')) {
        lookup[m.member_id] = { status: m.status, expiry_date: m.expiry_date }
      }
    }
    const today = new Date().toISOString().split('T')[0]

    return rows.map((row): BiometricAttendance => {
      const mem = row.member ? lookup[row.member.id] : undefined
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
  } catch (err) {
    console.error('getTodaysAttendanceLog error:', err)
    return []
  }
}

export async function syncBiometricToCRM(): Promise<BiometricSyncResult | null> {
  return apiFetch<BiometricSyncResult>('/api/biometric/sync', { method: 'POST' })
}

export async function runAccessSync(): Promise<BiometricAccessSyncResult | null> {
  return apiFetch<BiometricAccessSyncResult>('/api/biometric/access-sync', { method: 'POST' })
}

export async function getAccessStatus(): Promise<BiometricAccessRow[]> {
  const res = await apiFetch<BiometricAccessRow[]>('/api/biometric/access-status')
  return res ?? []
}

export async function getPushStatus(): Promise<BiometricPushStatus[]> {
  const res = await apiFetch<BiometricPushStatus[]>('/api/biometric/push-status')
  if (!res || res.length === 0) return []

  const memberIds = res.map(r => r.crm_id).filter(Boolean)
  const supabase  = await createClient()
  const { data: memberships } = await supabase
    .from('memberships')
    .select('member_id, status, expiry_date')
    .in('member_id', memberIds)

  const lookup: Record<string, { status: string; expiry_date: string }> = {}
  for (const m of memberships ?? []) {
    const cur = lookup[m.member_id]
    if (!cur || (m.expiry_date ?? '') > (cur.expiry_date ?? '')) {
      lookup[m.member_id] = { status: m.status, expiry_date: m.expiry_date }
    }
  }

  const today = new Date().toISOString().split('T')[0]
  return res.map(r => {
    const mem = lookup[r.crm_id]
    if (!mem) return { ...r, membership_status: 'none' as const }
    const active = mem.status === 'active' && mem.expiry_date >= today
    return {
      ...r,
      membership_status: active ? 'active' as const : 'expired' as const,
      expiry_date:       mem.expiry_date,
    }
  })
}

export async function pushMembersToDevice(memberIds: string[]): Promise<BiometricPushResult | null> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const res = await apiFetch<BiometricPushResult>('/api/biometric/push-members', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ member_ids: memberIds }),
    })
    await logBiometricAction('push_members', profile.user_id, memberIds.join(','), { count: memberIds.length, result: res }, !!res)
    return res
  } catch {
    return null
  }
}

export async function deleteDeviceUser(uid: number): Promise<boolean> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const res = await apiFetch<{ success: boolean }>(`/api/biometric/users/${uid}`, {
      method: 'DELETE',
    })
    const success = res?.success ?? false
    await logBiometricAction('delete_user', profile.user_id, String(uid), {}, success)
    return success
  } catch {
    return false
  }
}

export async function setDeviceUserAccess(
  uid: number,
  name: string,
  userId: string,
  groupId: '0' | '1',
): Promise<boolean> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const res = await apiFetch<{ success: boolean }>(`/api/biometric/users/${uid}/access`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ group_id: groupId, name, user_id: userId }),
    })
    const success = res?.success ?? false
    await logBiometricAction('set_access', profile.user_id, String(uid), { name, userId, groupId }, success)
    return success
  } catch {
    return false
  }
}

export async function unlockDoor(): Promise<boolean> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const res = await apiFetch<{ success: boolean }>('/api/biometric/unlock', { method: 'POST' })
    const success = res?.success ?? false
    await logBiometricAction('unlock', profile.user_id, 'door', {}, success)
    return success
  } catch {
    return false
  }
}

export interface MemberBiometricInfo {
  enrolled:   boolean
  deviceUid?: number
  checkIns:   BiometricAttendance[]
}

export async function getMemberBiometricInfo(memberId: string): Promise<MemberBiometricInfo> {
  // memberId here is the CRM UUID; the device only knows the human-readable member_id.
  const supabase = await createClient()
  const { data: member } = await supabase
    .from('members')
    .select('member_id')
    .eq('id', memberId)
    .maybeSingle()

  if (!member) return { enrolled: false, checkIns: [] }

  const deviceUserId = String(member.member_id)

  const [users, records] = await Promise.all([
    apiFetch<BiometricUser[]>('/api/biometric/users'),
    apiFetch<BiometricAttendance[]>('/api/biometric/attendance?limit=2000'),
  ])

  const deviceUser = (users ?? []).find(u => u.user_id === deviceUserId)
  const checkIns = (records ?? [])
    .filter(r => r.user_id === deviceUserId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return { enrolled: !!deviceUser, deviceUid: deviceUser?.uid, checkIns }
}
