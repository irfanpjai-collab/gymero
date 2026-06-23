'use client'

import { useEffect, useState, useCallback } from 'react'
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
  Trash2,
  Ban,
  CircleCheck,
  Search,
  Clock,
  CircleX,
  Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getAdmsDevices,
  getAdmsCommandHistory,
  getAttendanceLog,
  getMembersAdmsStatus,
  queueEnroll,
  queueRemove,
  queueBlock,
  queueUnblock,
  type AdmsDevice,
  type AdmsCommand,
  type MemberAdmsStatus,
} from '@/app/actions/adms'
import { getMembers } from '@/app/actions/members'
import { createClient } from '@/lib/supabase/client'
import type { BiometricAttendance, Member } from '@/types'

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
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

function EnrolledBadge({ enrolled }: { enrolled: boolean }) {
  return enrolled ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
      <Fingerprint className="w-3 h-3" /> Enrolled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border text-muted-foreground bg-muted/30 border-border">
      <Fingerprint className="w-3 h-3" /> Not enrolled
    </span>
  )
}

function AccessBadge({ blocked }: { blocked: boolean }) {
  return blocked ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border text-red-400 bg-red-500/10 border-red-500/20">
      <Ban className="w-3 h-3" /> Blocked
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
      <CircleCheck className="w-3 h-3" /> Active
    </span>
  )
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function BiometricPage() {
  const [tab, setTab] = useState<'attendance' | 'members' | 'queue'>('attendance')
  const [devices, setDevices] = useState<AdmsDevice[]>([])
  const [attendance, setAttendance] = useState<BiometricAttendance[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [commands, setCommands] = useState<AdmsCommand[]>([])
  const [admsStatus, setAdmsStatus] = useState<Record<number, MemberAdmsStatus>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyMemberId, setBusyMemberId] = useState<number | null>(null)
  const [attendanceDate, setAttendanceDate] = useState(todayStr())
  const [membershipFilter, setMembershipFilter] = useState<'all' | 'active' | 'expired' | 'none'>('all')

  // Shared fetch, no loading-spinner side effect — used both for the initial
  // load and for silent background refreshes triggered by Realtime events.
  const fetchData = useCallback(async () => {
    const [d, att, m, cmds, status] = await Promise.all([
      getAdmsDevices(),
      getAttendanceLog(attendanceDate),
      getMembers(),
      getAdmsCommandHistory(),
      getMembersAdmsStatus(),
    ])
    setDevices(d)
    setAttendance(att)
    setMembers(m)
    setCommands(cmds)
    setAdmsStatus(status)
  }, [attendanceDate])

  const loadAll = useCallback(async () => {
    setLoading(true)
    await fetchData()
    setLoading(false)
  }, [fetchData])

  useEffect(() => { loadAll() }, [loadAll])

  // Live updates — without this, the page only ever showed what was loaded on
  // mount; a new punch or a command flipping from "pending" to "done" needed a
  // manual refresh to appear. Subscribes to every table this page displays.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('biometric_page_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'adms_commands' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'adms_devices' }, () => fetchData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  const deviceOnline = devices.some(d => {
    if (!d.last_seen) return false
    return Date.now() - new Date(d.last_seen).getTime() < 5 * 60 * 1000
  })

  async function handleAction(
    action: 'enroll' | 'remove' | 'block' | 'unblock',
    member: Member,
  ) {
    setBusyMemberId(member.member_id)
    const res =
      action === 'enroll' ? await queueEnroll(member.member_id, member.full_name) :
      action === 'remove' ? await queueRemove(member.member_id) :
      action === 'block'  ? await queueBlock(member.member_id) :
                             await queueUnblock(member.member_id)

    if (res.error) toast.error(res.error)
    else toast.success(`Queued — will apply next time the device checks in`)
    setBusyMemberId(null)
    loadAll()
  }

  const filteredMembers = members.filter(m =>
    search ? m.full_name.toLowerCase().includes(search.toLowerCase()) || String(m.member_id).includes(search) : true
  )

  const filteredAttendance = attendance.filter(a =>
    membershipFilter === 'all' ? true : (a.membership_status ?? 'none') === membershipFilter
  )

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
              Device-push integration — commands apply on the device's next check-in, not instantly.
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
                {isToday ? "Today's Attendance" : `Attendance — ${new Date(attendanceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
              </span>
            </div>
            {filteredAttendance.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <Fingerprint className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-muted-foreground text-sm">No punches match this filter</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Member', 'Time', 'Type', 'Membership'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map((a, i) => (
                    <tr key={`${a.user_id}-${a.timestamp}-${i}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {a.crm_id ? (
                          <Link href={`/members/${a.crm_id}`} className="hover:text-primary hover:underline transition-colors">
                            {a.user_name ?? a.user_id}
                          </Link>
                        ) : (a.user_name ?? a.user_id)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{formatDateTime(a.timestamp)}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          {a.punch === 0 ? <LogIn className="w-3.5 h-3.5 text-emerald-400" /> : <LogOut className="w-3.5 h-3.5 text-blue-400" />}
                          {a.punch === 0 ? 'Check In' : 'Check Out'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                          a.membership_status === 'active' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                          a.membership_status === 'expired' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                          'text-muted-foreground bg-muted/30 border-border'
                        }`}>
                          {a.membership_status === 'active' ? 'Active' : a.membership_status === 'expired' ? 'Expired' : 'No membership'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full pl-9 px-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground"
            />
          </div>
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Member', 'ID', 'Fingerprint', 'Access', ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map(m => {
                  const busy = busyMemberId === m.member_id
                  const status = admsStatus[m.member_id] ?? { enrolled: false, blocked: false }
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 font-medium text-foreground">{m.full_name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">#{m.member_id}</td>
                      <td className="px-4 py-2.5"><EnrolledBadge enrolled={status.enrolled} /></td>
                      <td className="px-4 py-2.5"><AccessBadge blocked={status.blocked} /></td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button disabled={busy} onClick={() => handleAction('enroll', m)} className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/70 disabled:opacity-50">
                            <UserPlus className="w-3.5 h-3.5" /> Enroll
                          </button>
                          <button disabled={busy} onClick={() => handleAction('block', m)} className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50">
                            <Ban className="w-3.5 h-3.5" /> Block
                          </button>
                          <button disabled={busy} onClick={() => handleAction('unblock', m)} className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
                            <CircleCheck className="w-3.5 h-3.5" /> Unblock
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
                    <td className="px-4 py-2.5 text-foreground font-medium capitalize">{cmd.operation}</td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">#{cmd.member_id}</td>
                    <td className="px-4 py-2.5"><CommandStatusBadge status={cmd.status} /></td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{formatDateTime(cmd.created_at)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{cmd.result ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
