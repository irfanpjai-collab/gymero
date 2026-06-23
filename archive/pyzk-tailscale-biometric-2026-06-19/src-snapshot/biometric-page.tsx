'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Fingerprint,
  Wifi,
  WifiOff,
  RefreshCw,
  ArrowRightLeft,
  LogIn,
  LogOut,
  ShieldCheck,
  ShieldOff,
  Shield,
  Loader2,
  Upload,
  Trash2,
  X,
  Check,
  Search,
  DoorOpen,
  Ban,
  CircleCheck,
} from 'lucide-react'
import {
  getBiometricStatus,
  getBiometricUsers,
  getBiometricAttendance,
  getTodaysAttendanceLog,
  syncBiometricToCRM,
  runAccessSync,
  getAccessStatus,
  getPushStatus,
  pushMembersToDevice,
  deleteDeviceUser,
  setDeviceUserAccess,
  unlockDoor,
} from '@/app/actions/biometric'
import {
  BiometricStatus,
  BiometricUser,
  BiometricAttendance,
  BiometricAccessRow,
  BiometricAccessSyncResult,
  BiometricPushStatus,
  BiometricPushResult,
} from '@/types'

const AI_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_AI_MONITOR_URL ?? 'http://localhost:8000')
    : 'http://localhost:8000'

// Low-privilege key for the read-only live SSE feed only — browsers' native
// EventSource can't set custom headers, so this is sent as a query param.
// Never reuse BRIDGE_API_KEY here; that one guards unlock/delete/push endpoints.
const STREAM_KEY = process.env.NEXT_PUBLIC_BRIDGE_STREAM_KEY ?? ''

type Tab = 'live' | 'attendance' | 'members' | 'access'

const PUNCH_LABELS: Record<number, string> = {
  0: 'Check In',
  1: 'Check Out',
  4: 'OT In',
  5: 'OT Out',
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return iso }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return iso }
}

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

export default function BiometricPage() {
  const [tab, setTab]           = useState<Tab>('live')
  const [status, setStatus]     = useState<BiometricStatus | null>(null)
  const [users, setUsers]       = useState<BiometricUser[]>([])
  const [attendance, setAttendance] = useState<BiometricAttendance[]>([])
  const [livePunches, setLivePunches] = useState<(BiometricAttendance & { user_name?: string })[]>([])
  const [loading, setLoading]         = useState(true)
  const [syncing, setSyncing]         = useState(false)
  const [syncMsg, setSyncMsg]         = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [dateFilter, setDateFilter]   = useState('')
  const [accessRows, setAccessRows]       = useState<BiometricAccessRow[]>([])
  const [accessSyncing, setAccessSyncing] = useState(false)
  const [accessResult, setAccessResult]   = useState<BiometricAccessSyncResult | null>(null)

  // Push modal
  const [showPush, setShowPush]           = useState(false)
  const [pushList, setPushList]           = useState<BiometricPushStatus[]>([])
  const [pushLoading, setPushLoading]     = useState(false)
  const [pushSearch, setPushSearch]       = useState('')
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [pushing, setPushing]             = useState(false)
  const [pushResult, setPushResult]       = useState<BiometricPushResult | null>(null)

  // Delete / block / unlock
  const [deletingUid, setDeletingUid]     = useState<number | null>(null)
  const [blockingUid, setBlockingUid]     = useState<number | null>(null)
  const [unlocking, setUnlocking]         = useState(false)
  const [unlockMsg, setUnlockMsg]         = useState<string | null>(null)

  const userMapRef = useRef<Record<string, string>>({})
  // device user_id ("1001") → CRM member UUID, for linking live punches to /members/[id]
  const crmIdMapRef = useRef<Record<string, string>>({})

  // Merges new punches into the live feed, deduping by user_id+timestamp (the same
  // key attendance_logs is unique on) and re-sorting newest-first.
  const mergeLivePunches = useCallback(
    (incoming: (BiometricAttendance & { user_name?: string })[]) => {
      setLivePunches(prev => {
        const seen = new Set<string>()
        const merged: (BiometricAttendance & { user_name?: string })[] = []
        for (const p of [...incoming, ...prev]) {
          const key = `${p.user_id}-${p.timestamp}`
          if (seen.has(key)) continue
          seen.add(key)
          merged.push(p)
        }
        return merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100)
      })
    },
    []
  )

  // ── Initial load ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    const [st, us, att, acc, ps, todayLog] = await Promise.all([
      getBiometricStatus(),
      getBiometricUsers(),
      getBiometricAttendance(),
      getAccessStatus(),
      getPushStatus(),
      getTodaysAttendanceLog(),
    ])
    setStatus(st)
    setUsers(us)
    setAccessRows(acc)
    setPushList(ps)

    const nameMap: Record<string, string> = {}
    for (const u of us) nameMap[u.user_id] = u.name
    userMapRef.current = nameMap

    const crmMap: Record<string, string> = {}
    for (const r of acc) if (r.crm_member_id) crmMap[r.device_user_id] = r.crm_member_id
    crmIdMapRef.current = crmMap

    const enriched = att.map(a => ({ ...a, user_name: nameMap[a.user_id] ?? a.user_id }))
    setAttendance(enriched)

    // Seed the live feed from today's persisted log — a reload no longer wipes it.
    mergeLivePunches(todayLog.map(p => ({ ...p, user_name: p.user_name ?? nameMap[p.user_id] ?? p.user_id })))

    setLoading(false)
  }, [mergeLivePunches])

  useEffect(() => { loadAll() }, [loadAll])

  // ── SSE live stream ──────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`${AI_URL}/api/biometric/live?key=${encodeURIComponent(STREAM_KEY)}`)

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'connected' || data.type === 'ping') return

        const punch = data as BiometricAttendance
        const name  = userMapRef.current[punch.user_id] ?? punch.user_id
        const crmId = crmIdMapRef.current[punch.user_id]
        mergeLivePunches([{ ...punch, user_name: name, crm_id: crmId }])
      } catch { /* ignore */ }
    }

    return () => es.close()
  }, [mergeLivePunches])

  // ── Open push modal ───────────────────────────────────────────
  const openPushModal = async () => {
    setShowPush(true)
    setPushResult(null)
    setSelected(new Set())
    setPushSearch('')
    setPushLoading(true)
    const list = await getPushStatus()
    setPushList(list)
    setPushLoading(false)
  }

  // ── Push selected members to device ──────────────────────────
  const handlePush = async () => {
    if (selected.size === 0) return
    setPushing(true)
    const res = await pushMembersToDevice(Array.from(selected))
    setPushing(false)
    setPushResult(res)
    if (res && res.pushed > 0) loadAll()
  }

  // ── Delete device user ────────────────────────────────────────
  const handleDelete = async (uid: number, name: string) => {
    if (!confirm(`Remove "${name}" and their fingerprint from the device?`)) return
    setDeletingUid(uid)
    await deleteDeviceUser(uid)
    setDeletingUid(null)
    loadAll()
  }

  // ── Block / unblock ──────────────────────────────────────────
  const handleSetAccess = async (uid: number, name: string, userId: string, groupId: '0' | '1') => {
    setBlockingUid(uid)
    await setDeviceUserAccess(uid, name, userId, groupId)
    setBlockingUid(null)
    loadAll()
  }

  // ── Open door ────────────────────────────────────────────────
  const handleUnlock = async () => {
    setUnlocking(true)
    setUnlockMsg(null)
    const ok = await unlockDoor()
    setUnlocking(false)
    setUnlockMsg(ok ? 'Door opened for 3 seconds' : 'Failed to open door — check device connection')
    setTimeout(() => setUnlockMsg(null), 4000)
  }

  // ── Access control sync ──────────────────────────────────────
  const handleAccessSync = async () => {
    setAccessSyncing(true)
    setAccessResult(null)
    const res = await runAccessSync()
    setAccessSyncing(false)
    if (res) {
      setAccessResult(res)
      const fresh = await getAccessStatus()
      setAccessRows(fresh)
    }
  }

  // ── Attendance CRM sync ───────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    const res = await syncBiometricToCRM()
    setSyncing(false)
    if (res) {
      setSyncMsg(res.message)
      loadAll()
    } else {
      setSyncMsg('Sync failed — check device connection')
    }
  }

  // ── Derived data ─────────────────────────────────────────────
  const filteredAttendance = attendance.filter(a => {
    const matchName = search
      ? (a.user_name ?? a.user_id).toLowerCase().includes(search.toLowerCase())
      : true
    const matchDate = dateFilter
      ? a.timestamp.startsWith(dateFilter)
      : true
    return matchName && matchDate
  })

  // ── Stats ─────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0]
  const todayAtt = attendance.filter(a => a.timestamp.startsWith(todayStr))
  const todayIns = todayAtt.filter(a => a.punch === 0).length

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Fingerprint className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Biometric Attendance</h1>
              <p className="text-xs text-muted-foreground">ESSL K90 Pro — ZKTeco Protocol</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadAll}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border hover:bg-white/[0.04] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleUnlock}
              disabled={unlocking || !status?.connected}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-amber-500/90 text-black hover:bg-amber-400 transition-colors disabled:opacity-50 font-medium"
            >
              {unlocking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <DoorOpen className="w-4 h-4" />
              )}
              Open Door
            </button>
            <button
              onClick={handleSync}
              disabled={syncing || !status?.connected}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="w-4 h-4" />
              )}
              Sync to CRM
            </button>
          </div>
        </div>

        {/* Unlock message */}
        {unlockMsg && (
          <div className={`text-sm px-4 py-2.5 rounded-lg border ${
            unlockMsg.includes('Failed')
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
          }`}>
            {unlockMsg}
          </div>
        )}

        {/* Sync result message */}
        {syncMsg && (
          <div className={`text-sm px-4 py-2.5 rounded-lg border ${
            syncMsg.includes('failed')
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : 'bg-green-500/10 border-green-500/20 text-green-400'
          }`}>
            {syncMsg}
          </div>
        )}

        {/* ── Device status card ──────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {status === null ? (
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              ) : status.connected ? (
                <Wifi className="w-5 h-5 text-green-400" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-400" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {status === null
                    ? 'Checking device…'
                    : status.connected
                    ? 'Device Connected'
                    : 'Device Offline'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {status?.host ?? 'Not configured'}
                  {status?.serial ? ` · Serial: ${status.serial}` : ''}
                  {status?.error ? ` · ${status.error}` : ''}
                </p>
              </div>
            </div>

            {/* Quick stats */}
            <div className="hidden sm:flex items-center gap-6 text-center">
              <div>
                <p className="text-lg font-semibold text-foreground">{users.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Enrolled</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <p className="text-lg font-semibold text-foreground">{todayIns}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Today In</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <p className="text-lg font-semibold text-foreground">{attendance.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Logs</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-border">
            {([
              { key: 'live',       label: 'Live Punches',   count: livePunches.length },
              { key: 'attendance', label: 'Attendance Log', count: attendance.length },
              { key: 'members',    label: 'Enrollment',     count: pushList.filter(m => m.on_device).length },
              { key: 'access',     label: 'Access Control', count: accessRows.filter(r => r.access === 'blocked').length },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSearch(''); setDateFilter('') }}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {t.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  tab === t.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search / filter bar — hidden on access tab (has its own controls) */}
          {tab !== 'access' && (
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/30">
              <input
                type="text"
                placeholder={tab === 'members' ? 'Search by name…' : 'Search by name or ID…'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {tab === 'attendance' && (
                <input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="bg-transparent text-sm text-foreground outline-none border border-border rounded-lg px-3 py-1.5"
                />
              )}
            </div>
          )}

          {/* ── Live punches ──────────────────────────────────────── */}
          {tab === 'live' && (
            <div className="divide-y divide-border">
              {livePunches.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                  <div className="relative">
                    <Fingerprint className="w-12 h-12 opacity-20" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                  </div>
                  <p className="text-sm">Listening for punches…</p>
                  <p className="text-xs opacity-60">New entries appear here in real time</p>
                </div>
              ) : (
                livePunches.map((p, i) => (
                  <LivePunchRow key={`${p.user_id}-${p.timestamp}-${i}`} punch={p} />
                ))
              )}
            </div>
          )}

          {/* ── Attendance log ────────────────────────────────────── */}
          {tab === 'attendance' && (
            loading ? (
              <LoadingRows />
            ) : filteredAttendance.length === 0 ? (
              <EmptyState label="No attendance records found" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-muted-foreground uppercase tracking-wider bg-background/40">
                      <th className="text-left px-4 py-3 font-medium">Name</th>
                      <th className="text-left px-4 py-3 font-medium">Date</th>
                      <th className="text-left px-4 py-3 font-medium">Time</th>
                      <th className="text-left px-4 py-3 font-medium">Type</th>
                      <th className="text-left px-4 py-3 font-medium">Membership</th>
                      <th className="text-left px-4 py-3 font-medium">Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredAttendance.map((a, i) => (
                      <tr key={`${a.user_id}-${a.timestamp}-${i}`} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {a.crm_id ? (
                            <Link href={`/members/${a.crm_id}`} className="hover:text-primary hover:underline transition-colors">
                              {a.user_name ?? a.user_id}
                            </Link>
                          ) : (
                            a.user_name ?? a.user_id
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(a.timestamp)}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{formatTime(a.timestamp)}</td>
                        <td className="px-4 py-3">
                          <PunchBadge punch={a.punch} />
                        </td>
                        <td className="px-4 py-3">
                          <MembershipBadge status={a.membership_status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {a.expiry_date ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── Enrollment ────────────────────────────────────────── */}
          {tab === 'members' && (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/30">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Fingerprint className="w-3.5 h-3.5 text-primary" />
                    {pushList.filter(m => m.on_device).length} enrolled
                  </span>
                  <span className="text-border">|</span>
                  <span>{pushList.filter(m => !m.on_device).length} not enrolled</span>
                </div>
                <button
                  onClick={openPushModal}
                  disabled={!status?.connected}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Push to Device
                </button>
              </div>

              {loading ? (
                <LoadingRows />
              ) : pushList.length === 0 ? (
                <EmptyState label="No CRM members found" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] text-muted-foreground uppercase tracking-wider bg-background/40">
                        <th className="text-left px-4 py-3 font-medium">Member</th>
                        <th className="text-left px-4 py-3 font-medium">Fingerprint</th>
                        <th className="text-left px-4 py-3 font-medium">Membership</th>
                        <th className="text-left px-4 py-3 font-medium">Expires</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pushList
                        .filter(m => search
                          ? m.crm_name.toLowerCase().includes(search.toLowerCase())
                          : true
                        )
                        .map(m => {
                          const deviceUser = users.find(u => u.user_id === String(m.member_id))
                          return (
                            <tr key={m.crm_id} className="hover:bg-white/[0.02] group">
                              <td className="px-4 py-3">
                                <Link href={`/members/${m.crm_id}`} className="font-medium text-foreground hover:text-primary hover:underline transition-colors">
                                  {m.crm_name}
                                </Link>
                                <p className="text-[11px] text-muted-foreground">{m.mobile}</p>
                              </td>
                              <td className="px-4 py-3">
                                <EnrollmentBadge enrolled={m.on_device} />
                              </td>
                              <td className="px-4 py-3">
                                <MembershipBadge status={m.membership_status ?? 'none'} />
                              </td>
                              <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                                {m.expiry_date ?? '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {m.on_device && deviceUser && (() => {
                                  const accessRow = accessRows.find(r => r.device_uid === deviceUser.uid)
                                  const isBlocked = accessRow?.group_id === '0'
                                  const busy = blockingUid === deviceUser.uid || deletingUid === deviceUser.uid
                                  return (
                                    <div className="opacity-0 group-hover:opacity-100 flex items-center justify-end gap-2 transition-all">
                                      {isBlocked ? (
                                        <button
                                          onClick={() => handleSetAccess(deviceUser.uid, deviceUser.name, deviceUser.user_id, '1')}
                                          disabled={busy}
                                          className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 disabled:opacity-50"
                                        >
                                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CircleCheck className="w-3.5 h-3.5" />}
                                          Unblock
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => handleSetAccess(deviceUser.uid, deviceUser.name, deviceUser.user_id, '0')}
                                          disabled={busy}
                                          className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50"
                                        >
                                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                                          Block
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleDelete(deviceUser.uid, m.crm_name)}
                                        disabled={busy}
                                        className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                                      >
                                        {deletingUid === deviceUser.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                        Remove
                                      </button>
                                    </div>
                                  )
                                })()}
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Access Control ────────────────────────────────────── */}
          {tab === 'access' && (
            <div>
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/30">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-green-400" />
                    {accessRows.filter(r => r.access === 'allowed').length} allowed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ShieldOff className="w-4 h-4 text-red-400" />
                    {accessRows.filter(r => r.access === 'blocked').length} blocked
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    {accessRows.filter(r => r.access === 'unmanaged').length} unmanaged
                  </span>
                </div>
                <button
                  onClick={handleAccessSync}
                  disabled={accessSyncing || !status?.connected}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {accessSyncing
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <ShieldCheck className="w-3.5 h-3.5" />
                  }
                  Run Access Sync
                </button>
              </div>

              {/* Sync result banner */}
              {accessResult && (
                <div className="mx-4 mt-3 text-xs px-3 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                  Sync ran at {new Date(accessResult.ran_at).toLocaleTimeString()} —{' '}
                  {accessResult.blocked.length > 0 && `🔒 Blocked: ${accessResult.blocked.join(', ')}. `}
                  {accessResult.unblocked.length > 0 && `✅ Restored: ${accessResult.unblocked.join(', ')}. `}
                  {accessResult.blocked.length === 0 && accessResult.unblocked.length === 0 && 'No changes needed. '}
                  {accessResult.unmatched > 0 && `${accessResult.unmatched} device users not in CRM (skipped).`}
                </div>
              )}

              {/* Table */}
              {loading ? (
                <LoadingRows />
              ) : accessRows.length === 0 ? (
                <EmptyState label="No device users found" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] text-muted-foreground uppercase tracking-wider bg-background/40">
                        <th className="text-left px-4 py-3 font-medium">Device Name</th>
                        <th className="text-left px-4 py-3 font-medium">CRM Member</th>
                        <th className="text-left px-4 py-3 font-medium">Membership</th>
                        <th className="text-left px-4 py-3 font-medium">Expires</th>
                        <th className="text-left px-4 py-3 font-medium">Access</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {accessRows.map(row => (
                        <tr key={row.device_uid} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-medium text-foreground">{row.device_name}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {row.crm_name && row.crm_member_id ? (
                              <Link href={`/members/${row.crm_member_id}`} className="hover:text-primary hover:underline transition-colors">
                                {row.crm_name}
                              </Link>
                            ) : (
                              <span className="italic opacity-50">Not in CRM</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {row.membership_status ? (
                              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                row.membership_status === 'active'
                                  ? 'bg-green-500/15 text-green-400'
                                  : 'bg-red-500/15 text-red-400'
                              }`}>
                                {row.membership_status}
                              </span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">none</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                            {row.expiry_date ? formatDateTime(row.expiry_date) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <AccessBadge access={row.access} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Push CRM Members modal ──────────────────────────── */}
      {showPush && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-foreground">Push Members to Device</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Creates name + ID records. Member scans finger at device afterward.
                </p>
              </div>
              <button onClick={() => setShowPush(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Search members…"
                value={pushSearch}
                onChange={e => setPushSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>

            {/* Push result banner */}
            {pushResult && (
              <div className={`mx-4 mt-3 text-xs px-3 py-2 rounded-lg border ${
                pushResult.failed > 0
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-green-500/10 border-green-500/20 text-green-400'
              }`}>
                {pushResult.pushed} pushed successfully
                {pushResult.failed > 0 && `, ${pushResult.failed} failed`}
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {pushLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading CRM members…</span>
                </div>
              ) : (
                pushList
                  .filter(m => !pushSearch || m.crm_name.toLowerCase().includes(pushSearch.toLowerCase()))
                  .map(m => {
                    const done = pushResult?.results.find(r => r.crm_id === m.crm_id)
                    return (
                      <label
                        key={m.crm_id}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors ${
                          m.on_device ? 'opacity-50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={m.on_device || !!done?.success}
                          checked={selected.has(m.crm_id) || !!done?.success}
                          onChange={e => {
                            const s = new Set(selected)
                            e.target.checked ? s.add(m.crm_id) : s.delete(m.crm_id)
                            setSelected(s)
                          }}
                          className="w-4 h-4 accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{m.crm_name}</p>
                          <p className="text-xs text-muted-foreground">{m.mobile}</p>
                        </div>
                        {m.on_device && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
                            On device
                          </span>
                        )}
                        {done?.success && (
                          <Check className="w-4 h-4 text-green-400 shrink-0" />
                        )}
                        {done && !done.success && (
                          <span className="text-[10px] text-red-400">Failed</span>
                        )}
                      </label>
                    )
                  })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-border">
              <button
                onClick={() => {
                  const unsynced = pushList.filter(m => !m.on_device).map(m => m.crm_id)
                  setSelected(new Set(unsynced))
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Select all not on device
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPush(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-white/[0.04] transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handlePush}
                  disabled={selected.size === 0 || pushing}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {pushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Push {selected.size > 0 ? `(${selected.size})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function PunchBadge({ punch }: { punch: number }) {
  const label   = PUNCH_LABELS[punch] ?? `Type ${punch}`
  const isIn    = punch === 0 || punch === 4
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
      isIn
        ? 'bg-green-500/15 text-green-400'
        : 'bg-blue-500/15 text-blue-400'
    }`}>
      {isIn ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
      {label}
    </span>
  )
}

function LivePunchRow({ punch }: { punch: BiometricAttendance & { user_name?: string } }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
        punch.punch === 0 || punch.punch === 4 ? 'bg-green-500/15' : 'bg-blue-500/15'
      }`}>
        {punch.punch === 0 || punch.punch === 4
          ? <LogIn className="w-4 h-4 text-green-400" />
          : <LogOut className="w-4 h-4 text-blue-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        {punch.crm_id ? (
          <Link
            href={`/members/${punch.crm_id}`}
            className="text-sm font-medium text-foreground truncate block hover:text-primary hover:underline transition-colors"
          >
            {punch.user_name ?? punch.user_id}
          </Link>
        ) : (
          <p className="text-sm font-medium text-foreground truncate">{punch.user_name ?? punch.user_id}</p>
        )}
        <p className="text-xs text-muted-foreground">{PUNCH_LABELS[punch.punch] ?? `Type ${punch.punch}`}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <MembershipBadge status={punch.membership_status} />
        <div className="text-right">
          <p className="text-sm font-mono text-foreground">{formatTime(punch.timestamp)}</p>
          <p className="text-xs text-muted-foreground">{formatDate(punch.timestamp)}</p>
        </div>
      </div>
    </div>
  )
}

function EnrollmentBadge({ enrolled }: { enrolled: boolean }) {
  if (enrolled) return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium whitespace-nowrap">
      <Fingerprint className="w-3 h-3" /> Enrolled
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium whitespace-nowrap">
      <Fingerprint className="w-3 h-3" /> Not enrolled
    </span>
  )
}

function MembershipBadge({ status }: { status?: 'active' | 'expired' | 'none' }) {
  if (status === 'active') return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium whitespace-nowrap">
      <ShieldCheck className="w-3 h-3" /> Active
    </span>
  )
  if (status === 'expired') return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium whitespace-nowrap">
      <ShieldOff className="w-3 h-3" /> Expired
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium whitespace-nowrap">
      <Shield className="w-3 h-3" /> No plan
    </span>
  )
}

function AccessBadge({ access }: { access: 'allowed' | 'blocked' | 'unmanaged' }) {
  if (access === 'allowed') return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">
      <ShieldCheck className="w-3 h-3" /> Allowed
    </span>
  )
  if (access === 'blocked') return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium">
      <ShieldOff className="w-3 h-3" /> Blocked
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
      <Shield className="w-3 h-3" /> Unmanaged
    </span>
  )
}

function LoadingRows() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">Loading from device…</span>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <Fingerprint className="w-10 h-10 opacity-20" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
