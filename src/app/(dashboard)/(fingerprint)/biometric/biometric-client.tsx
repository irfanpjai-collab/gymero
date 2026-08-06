'use client'

import { Fragment, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Fingerprint,
  Wifi,
  WifiOff,
  RefreshCw,
  LogIn,
  LogOut,
  Loader2,
  UserPlus,
  UserCheck,
  Trash2,
  CircleCheck,
  Search,
  Clock,
  CircleX,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getBiometricPageData,
  queueEnroll,
  queueRemove,
  bulkEnrollAllMembers,
  type AdmsDevice,
  type AdmsCommand,
  type MemberAdmsStatus,
  type MemberLite,
  type BiometricPageData,
} from '@/app/actions/adms'
import { createClient } from '@/lib/supabase/client'
import { subscribeToAttendanceInserts } from '@/lib/realtime/attendance-bus'
import { formatDateTime as formatDateTimeIST } from '@/lib/utils'
import type { BiometricAttendance } from '@/types'

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  try {
    return formatDateTimeIST(iso)
  } catch { return iso }
}

function CommandStatusBadge({ status }: { status: AdmsCommand['status'] }) {
  const map = {
    pending: { icon: Clock, cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20', label: 'Pending' },
    sent:    { icon: Clock, cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20', label: 'Sent — waiting on device' },
    done:    { icon: CircleCheck, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: 'Done' },
    failed:  { icon: CircleX, cls: 'text-red-400 bg-red-500/10 border-red-500/20', label: 'Failed' },
  } as const
  const { icon: Icon, cls, label } = map[status]
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  )
}

function PushedBadge({ pushed }: { pushed: boolean }) {
  return pushed ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
      <UserCheck className="w-3 h-3" /> Pushed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border text-muted-foreground bg-muted/30 border-border">
      <UserCheck className="w-3 h-3" /> Not pushed
    </span>
  )
}

function FingerprintBadge({ enrolled }: { enrolled: boolean }) {
  return enrolled ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
      <Fingerprint className="w-3 h-3" /> Enrolled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border text-muted-foreground bg-muted/30 border-border">
      <Fingerprint className="w-3 h-3" /> No fingerprint
    </span>
  )
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function isDeviceOnline(devices: AdmsDevice[]): boolean {
  return devices.some(d => {
    if (!d.last_seen) return false
    return Date.now() - new Date(d.last_seen).getTime() < 5 * 60 * 1000
  })
}

export default function BiometricClient({ initialData }: { initialData: BiometricPageData }) {
  const [tab, setTab] = useState<'attendance' | 'members' | 'queue'>('attendance')
  const [devices, setDevices] = useState<AdmsDevice[]>(initialData.devices)
  const [deviceOnline, setDeviceOnline] = useState(() => isDeviceOnline(initialData.devices))
  const [attendance, setAttendance] = useState<BiometricAttendance[]>(initialData.attendance)
  const [members, setMembers] = useState<MemberLite[]>(initialData.members)
  const [commands, setCommands] = useState<AdmsCommand[]>(initialData.commands)
  const [admsStatus, setAdmsStatus] = useState<Record<number, MemberAdmsStatus>>(initialData.admsStatus)
  // Server already fetched today's data before first paint (see page.tsx) —
  // no mount-time spinner needed, only for the manual Refresh button/date changes.
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [busyMemberId, setBusyMemberId] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [attendanceDate, setAttendanceDate] = useState(todayStr())
  const [membershipFilter, setMembershipFilter] = useState<'all' | 'active' | 'expired' | 'none'>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Shared fetch, no loading-spinner side effect — used both for the initial
  // load and for silent background refreshes triggered by Realtime events.
  // One combined server action instead of five separate ones — each call is
  // its own client→server round trip, which used to dominate load time even
  // though the underlying queries are individually fast.
  //
  // deviceOnline is computed here (once per fetch) rather than at render
  // time — calling Date.now() directly in the render body is an impure read
  // that can silently go stale between renders with no state change to
  // explain it.
  const fetchData = useCallback(async () => {
    const data = await getBiometricPageData(attendanceDate)
    setDevices(data.devices)
    setAttendance(data.attendance)
    setMembers(data.members)
    setCommands(data.commands)
    setAdmsStatus(data.admsStatus)
    setDeviceOnline(isDeviceOnline(data.devices))
  }, [attendanceDate])

  const loadAll = useCallback(async () => {
    setLoading(true)
    await fetchData()
    setLoading(false)
  }, [fetchData])

  // The server already fetched today's data before first paint (see
  // page.tsx/initialData) — skip the redundant re-fetch on that first mount,
  // but still fetch on every later change (attendanceDate changing recreates
  // loadAll, since fetchData depends on it).
  const skippedInitialFetch = useRef(false)
  useEffect(() => {
    if (!skippedInitialFetch.current) {
      skippedInitialFetch.current = true
      return
    }
    const timer = setTimeout(() => { loadAll() }, 0)
    return () => clearTimeout(timer)
  }, [loadAll])

  // Live updates — without this, the page only ever showed what was loaded on
  // mount; a new punch or a command flipping from "pending" to "done" needed a
  // manual refresh to appear. attendance_logs goes through the shared bus
  // (see src/lib/realtime/attendance-bus.ts) rather than its own binding here
  // — two separate channels both bound to attendance_logs in the same
  // session meant only one of them ever actually received the broadcast.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('biometric_page_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'adms_commands' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'adms_devices' }, () => fetchData())
      .subscribe()
    const unsubscribeAttendance = subscribeToAttendanceInserts(() => fetchData())

    return () => {
      supabase.removeChannel(channel)
      unsubscribeAttendance()
    }
  }, [fetchData])

  async function handleAction(
    action: 'enroll' | 'remove',
    member: MemberLite,
  ) {
    setBusyMemberId(member.member_id)
    const res =
      action === 'enroll' ? await queueEnroll(member.member_id, member.full_name) :
                             await queueRemove(member.member_id)

    if (res.error) toast.error(res.error)
    else toast.success(`Queued — will apply next time the device checks in`)
    setBusyMemberId(null)
    loadAll()
  }

  async function handleBulkSync() {
    setSyncing(true)
    const res = await bulkEnrollAllMembers()
    if (res.error) toast.error(res.error)
    else if (res.queued === 0) toast.success(`Everyone's already enrolled or in progress — nothing new to queue`)
    else toast.success(`${res.queued} member${res.queued !== 1 ? 's' : ''} queued${res.skipped ? ` (${res.skipped} already enrolled/in progress, skipped)` : ''} — device will pick them up on next check-in`)
    setSyncing(false)
    loadAll()
  }

  const filteredMembers = members.filter(m =>
    search ? m.full_name.toLowerCase().includes(search.toLowerCase()) || String(m.member_id).includes(search) : true
  )

  const filteredAttendance = attendance.filter(a =>
    membershipFilter === 'all' ? true : (a.membership_status ?? 'none') === membershipFilter
  )

  // One row per member instead of one row per punch — a member who checked
  // in and out a few times in a day used to flood the table with duplicate
  // rows. Punches within a group stay latest-first (the source query is
  // already ordered that way), and groups themselves are sorted by their
  // own latest punch so the most recently-active member is on top.
  const attendanceGroups = useMemo(() => {
    const groups = new Map<string, BiometricAttendance[]>()
    for (const a of filteredAttendance) {
      const key = a.crm_id ?? a.user_id
      const existing = groups.get(key)
      if (existing) existing.push(a)
      else groups.set(key, [a])
    }
    return Array.from(groups.values()).sort(
      (a, b) => new Date(b[0].timestamp).getTime() - new Date(a[0].timestamp).getTime()
    )
  }, [filteredAttendance])

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isToday = attendanceDate === todayStr()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Fingerprint className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Biometric (ADMS)</h1>
            <p className="text-muted-foreground text-xs mt-0.5">
              Device-push integration — commands apply on the device&apos;s next check-in, not instantly.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
            deviceOnline ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-muted-foreground bg-muted/30 border-border'
          }`}>
            {deviceOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {deviceOnline ? 'Device seen recently' : 'No device check-in in 5+ min'}
          </span>
          <button onClick={loadAll} className="inline-flex items-center gap-2 px-3 py-1.5 bg-card border border-border hover:bg-muted rounded-xl text-xs text-muted-foreground transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {devices.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Registered devices</p>
          <div className="space-y-1.5">
            {devices.map(d => (
              <div key={d.serial_number} className="flex items-center justify-between text-sm">
                <span className="font-mono text-foreground">{d.serial_number}</span>
                <span className="text-muted-foreground text-xs">Last seen: {formatDateTime(d.last_seen)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
        {(['attendance', 'members', 'queue'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'queue' ? 'Command Queue' : t}
          </button>
        ))}
      </div>

      {tab === 'attendance' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
              <input
                type="date"
                value={attendanceDate}
                max={todayStr()}
                onChange={e => setAttendanceDate(e.target.value)}
                className="pl-9 pr-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground"
              />
            </div>
            <button
              onClick={() => setAttendanceDate(todayStr())}
              disabled={isToday}
              className="px-3 py-2 bg-card border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm text-muted-foreground transition-colors"
            >
              Today
            </button>
            <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
              {(['all', 'active', 'expired', 'none'] as const).map(f => (
                <button key={f} onClick={() => setMembershipFilter(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${membershipFilter === f ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                  {f === 'none' ? 'No membership' : f}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <span className="text-foreground font-semibold text-sm">
                {isToday ? "Today's Attendance" : `Attendance — ${new Date(attendanceDate).toLocaleDateString('en-GB')}`}
              </span>
            </div>
            {attendanceGroups.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <Fingerprint className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-muted-foreground text-sm">No punches match this filter</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Member', 'Latest', 'Type', 'Membership'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendanceGroups.map(group => {
                    const latest = group[0]
                    const key = latest.crm_id ?? latest.user_id
                    const expanded = expandedGroups.has(key)
                    return (
                      <Fragment key={key}>
                        <tr
                          onClick={() => group.length > 1 && toggleGroup(key)}
                          className={`border-b border-border last:border-0 ${group.length > 1 ? 'cursor-pointer hover:bg-white/[0.02]' : ''}`}
                        >
                          <td className="px-4 py-2.5 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              {group.length > 1 && (expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />)}
                              {latest.crm_id ? (
                                <Link href={`/members/${latest.crm_id}`} onClick={e => e.stopPropagation()} className="hover:text-primary hover:underline transition-colors">
                                  {latest.user_name ?? latest.user_id}
                                </Link>
                              ) : (latest.user_name ?? latest.user_id)}
                              {group.length > 1 && (
                                <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">{group.length}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{formatDateTime(latest.timestamp)}</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              {latest.punch === 0 ? <LogIn className="w-3.5 h-3.5 text-emerald-400" /> : <LogOut className="w-3.5 h-3.5 text-blue-400" />}
                              {latest.punch === 0 ? 'Check In' : 'Check Out'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                              latest.membership_status === 'active' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                              latest.membership_status === 'expired' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                              latest.membership_status === 'coach' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
                              'text-muted-foreground bg-muted/30 border-border'
                            }`}>
                              {latest.membership_status === 'active' ? 'Active' : latest.membership_status === 'expired' ? 'Expired' : latest.membership_status === 'coach' ? 'Coach' : 'No membership'}
                            </span>
                          </td>
                        </tr>
                        {expanded && group.slice(1).map((a, i) => (
                          <tr key={`${key}-${i}`} className="border-b border-border last:border-0 bg-muted/10">
                            <td className="px-4 py-2 pl-10 text-muted-foreground text-xs">↳ same member</td>
                            <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{formatDateTime(a.timestamp)}</td>
                            <td className="px-4 py-2">
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                {a.punch === 0 ? <LogIn className="w-3.5 h-3.5 text-emerald-400" /> : <LogOut className="w-3.5 h-3.5 text-blue-400" />}
                                {a.punch === 0 ? 'Check In' : 'Check Out'}
                              </span>
                            </td>
                            <td className="px-4 py-2" />
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full pl-9 px-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground"
              />
            </div>
            <button
              onClick={handleBulkSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              {syncing ? 'Syncing…' : 'Sync All to Device'}
            </button>
          </div>
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Member', 'ID', 'Pushed', 'Fingerprint', ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map(m => {
                  const busy = busyMemberId === m.member_id
                  const status = admsStatus[m.member_id] ?? { pushedToDevice: false, fingerprintEnrolled: false, blocked: false }
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 font-medium text-foreground">{m.full_name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">#{m.member_id}</td>
                      <td className="px-4 py-2.5"><PushedBadge pushed={status.pushedToDevice} /></td>
                      <td className="px-4 py-2.5"><FingerprintBadge enrolled={status.fingerprintEnrolled} /></td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button disabled={busy} onClick={() => handleAction('enroll', m)} className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/70 disabled:opacity-50">
                            <UserPlus className="w-3.5 h-3.5" /> Enroll
                          </button>
                          <button disabled={busy} onClick={() => handleAction('remove', m)} className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-50">
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'queue' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <span className="text-foreground font-semibold text-sm">Command Queue</span>
            <p className="text-muted-foreground text-xs mt-0.5">Every enroll/block/unblock/remove request and its real status — nothing here is instant.</p>
          </div>
          {commands.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <Clock className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-muted-foreground text-sm">No commands queued yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Operation', 'Member', 'Status', 'Queued At', 'Result'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commands.map(cmd => (
                  <tr key={cmd.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-foreground font-medium capitalize">
                      {cmd.operation === 'unlock_door' ? 'Unlock Door' : cmd.operation}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">
                      {cmd.operation === 'unlock_door' ? '—' : `#${cmd.member_id}`}
                    </td>
                    <td className="px-4 py-2.5"><CommandStatusBadge status={cmd.status} /></td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{formatDateTime(cmd.created_at)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{cmd.result ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
