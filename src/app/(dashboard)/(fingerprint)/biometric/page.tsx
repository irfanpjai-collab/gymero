'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
} from 'lucide-react'
import {
  getBiometricStatus,
  getBiometricUsers,
  getBiometricAttendance,
  syncBiometricToCRM,
  runAccessSync,
  getAccessStatus,
  getPushStatus,
  pushMembersToDevice,
  deleteDeviceUser,
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

  // Delete
  const [deletingUid, setDeletingUid]     = useState<number | null>(null)

  const userMapRef = useRef<Record<string, string>>({})

  // ── Initial load ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    const [st, us, att, acc] = await Promise.all([
      getBiometricStatus(),
      getBiometricUsers(),
      getBiometricAttendance(),
      getAccessStatus(),
    ])
    setStatus(st)
    setUsers(us)
    setAccessRows(acc)

    const nameMap: Record<string, string> = {}
    for (const u of us) nameMap[u.user_id] = u.name
    userMapRef.current = nameMap

    const enriched = att.map(a => ({ ...a, user_name: nameMap[a.user_id] ?? a.user_id }))
    setAttendance(enriched)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── SSE live stream ──────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`${AI_URL}/api/biometric/live`)

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'connected' || data.type === 'ping') return

        const punch = data as BiometricAttendance
        const name  = userMapRef.current[punch.user_id] ?? punch.user_id
        setLivePunches(prev => [{ ...punch, user_name: name }, ...prev].slice(0, 100))
      } catch { /* ignore */ }
    }

    return () => es.close()
  }, [])

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

  const filteredUsers = users.filter(u =>
    search ? u.name.toLowerCase().includes(search.toLowerCase()) : true
  )

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
              { key: 'members',    label: 'Enrolled Users', count: users.length },
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
                      <th className="text-left px-4 py-3 font-medium">Device ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredAttendance.map((a, i) => (
                      <tr key={`${a.user_id}-${a.timestamp}-${i}`} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {a.user_name ?? a.user_id}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(a.timestamp)}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{formatTime(a.timestamp)}</td>
                        <td className="px-4 py-3">
                          <PunchBadge punch={a.punch} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{a.user_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── Members ───────────────────────────────────────────── */}
          {tab === 'members' && (
            <>
              {/* Members toolbar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/30">
                <p className="text-xs text-muted-foreground">{users.length} users on device</p>
                <button
                  onClick={openPushModal}
                  disabled={!status?.connected}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Push CRM Members
                </button>
              </div>

              {loading ? (
                <LoadingRows />
              ) : filteredUsers.length === 0 ? (
                <EmptyState label="No enrolled users found" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] text-muted-foreground uppercase tracking-wider bg-background/40">
                        <th className="text-left px-4 py-3 font-medium">#</th>
                        <th className="text-left px-4 py-3 font-medium">Name</th>
                        <th className="text-left px-4 py-3 font-medium">Device ID</th>
                        <th className="text-left px-4 py-3 font-medium">Role</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredUsers.map((u) => (
                        <tr key={u.uid} className="hover:bg-white/[0.02] group">
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{u.uid}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{u.user_id}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              u.privilege === 14
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {u.privilege === 14 ? 'Admin' : 'Member'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDelete(u.uid, u.name)}
                              disabled={deletingUid === u.uid}
                              className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-all disabled:opacity-50"
                            >
                              {deletingUid === u.uid
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />
                              }
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
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
                            {row.crm_name ?? <span className="italic opacity-50">Not in CRM</span>}
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
        <p className="text-sm font-medium text-foreground truncate">
          {punch.user_name ?? punch.user_id}
        </p>
        <p className="text-xs text-muted-foreground">{PUNCH_LABELS[punch.punch] ?? `Type ${punch.punch}`}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-mono text-foreground">{formatTime(punch.timestamp)}</p>
        <p className="text-xs text-muted-foreground">{formatDate(punch.timestamp)}</p>
      </div>
    </div>
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
