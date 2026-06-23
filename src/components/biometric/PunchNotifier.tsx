'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogIn, LogOut, X, CircleCheck, CircleX, Phone, CreditCard, CalendarClock } from 'lucide-react'

interface AttendanceLogRow {
  member_id: string | null
  device_user_id: string
  punched_at: string
  punch_type: number
}

interface PunchDetails {
  fullName: string
  memberNumber: number
  mobile: string
  punchType: number
  timestamp: string
  membershipStatus: 'active' | 'expired' | 'none'
  expiryDate: string | null
}

const AUTO_DISMISS_MS = 9000

/**
 * Mounted once in the dashboard layout — shows a large detail popup for every
 * fingerprint punch no matter which page is open. Subscribes to Supabase
 * Realtime changes on attendance_logs, so it works from anywhere with zero
 * dependency on any device/bridge being reachable.
 */
export default function PunchNotifier() {
  const [current, setCurrent] = useState<PunchDetails | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('attendance_logs_notifier')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_logs' },
        async (payload) => {
          if (payload.eventType !== 'INSERT') return
          const row = payload.new as AttendanceLogRow
          let details: PunchDetails

          try {
            if (row.member_id) {
              const [{ data: member }, { data: memberships }] = await Promise.all([
                supabase.from('members').select('full_name, member_id, mobile').eq('id', row.member_id).maybeSingle(),
                supabase
                  .from('memberships')
                  .select('status, expiry_date')
                  .eq('member_id', row.member_id)
                  .order('expiry_date', { ascending: false })
                  .limit(1),
              ])

              const latest = memberships?.[0]
              const today = new Date().toISOString().split('T')[0]
              const active = !!latest && latest.status === 'active' && latest.expiry_date >= today

              details = {
                fullName: member?.full_name ?? `Member #${row.device_user_id}`,
                memberNumber: member?.member_id ?? Number(row.device_user_id),
                mobile: member?.mobile ?? '',
                punchType: row.punch_type,
                timestamp: row.punched_at,
                membershipStatus: latest ? (active ? 'active' : 'expired') : 'none',
                expiryDate: latest?.expiry_date ?? null,
              }
            } else {
              details = {
                fullName: `Unknown member (#${row.device_user_id})`,
                memberNumber: Number(row.device_user_id) || 0,
                mobile: '',
                punchType: row.punch_type,
                timestamp: row.punched_at,
                membershipStatus: 'none',
                expiryDate: null,
              }
            }
          } catch {
            details = {
              fullName: `Member #${row.device_user_id}`,
              memberNumber: Number(row.device_user_id) || 0,
              mobile: '',
              punchType: row.punch_type,
              timestamp: row.punched_at,
              membershipStatus: 'none',
              expiryDate: null,
            }
          }

          console.log('[PunchNotifier] new attendance row, showing popup for', details.fullName)
          setCurrent(details)
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => setCurrent(null), AUTO_DISMISS_MS)
        }
      )
      .subscribe((status) => {
        console.log('[PunchNotifier] realtime channel status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!current) return null

  const isIn = current.punchType === 0 || current.punchType === 4
  const time = new Date(current.timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  const statusStyles =
    current.membershipStatus === 'active'
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : current.membershipStatus === 'expired'
      ? 'text-red-400 bg-red-500/10 border-red-500/20'
      : 'text-muted-foreground bg-muted/30 border-border'

  return (
    <div className="fixed bottom-20 left-4 right-4 lg:bottom-6 lg:left-auto lg:right-6 z-[100] lg:w-[50vw] lg:max-w-2xl lg:min-w-[400px] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
        <div className={`px-4 sm:px-6 py-4 flex items-center justify-between border-b border-border ${isIn ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 ${isIn ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`}>
              {isIn ? <LogIn className="w-5 h-5 text-emerald-400" /> : <LogOut className="w-5 h-5 text-blue-400" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isIn ? 'Checked In' : 'Checked Out'}
              </p>
              <p className="text-lg sm:text-xl font-bold text-foreground truncate">{current.fullName}</p>
            </div>
          </div>
          <button onClick={() => setCurrent(null)} className="text-muted-foreground hover:text-foreground shrink-0 ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-5 grid grid-cols-2 gap-4 sm:gap-5">
          <div className="flex items-center gap-2.5">
            <CreditCard className="w-4 h-4 text-muted-foreground/70 shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Member ID</p>
              <p className="text-sm font-mono text-foreground">#{current.memberNumber}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-4 h-4 text-muted-foreground/70 shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Time</p>
              <p className="text-sm font-mono text-foreground">{time}</p>
            </div>
          </div>

          {current.mobile && (
            <div className="flex items-center gap-2.5">
              <Phone className="w-4 h-4 text-muted-foreground/70 shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Mobile</p>
                <p className="text-sm text-foreground">{current.mobile}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            {current.membershipStatus === 'active'
              ? <CircleCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              : <CircleX className="w-4 h-4 text-muted-foreground/70 shrink-0" />}
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Membership</p>
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${statusStyles}`}>
                {current.membershipStatus === 'active' ? 'Active' : current.membershipStatus === 'expired' ? 'Expired' : 'No membership'}
              </span>
            </div>
          </div>

          {current.expiryDate && (
            <div className="col-span-2 pt-1 border-t border-border">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-3 mb-0.5">Membership Expires</p>
              <p className="text-sm text-foreground">
                {new Date(current.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
