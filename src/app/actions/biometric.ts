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

const AI_URL = process.env.AI_MONITOR_URL ?? 'http://localhost:8000'

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetch(`${AI_URL}${path}`, {
      ...init,
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
  const res = await apiFetch<BiometricAttendance[]>('/api/biometric/attendance?limit=1000')
  return res ?? []
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
  return res ?? []
}

export async function pushMembersToDevice(memberIds: string[]): Promise<BiometricPushResult | null> {
  return apiFetch<BiometricPushResult>('/api/biometric/push-members', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ member_ids: memberIds }),
  })
}

export async function deleteDeviceUser(uid: number): Promise<boolean> {
  const res = await apiFetch<{ success: boolean }>(`/api/biometric/users/${uid}`, {
    method: 'DELETE',
  })
  return res?.success ?? false
}
