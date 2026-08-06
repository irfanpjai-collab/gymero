'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShieldAlert, Calendar, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { getCheckInsForDate, type RecentCheckIn } from '@/app/actions/adms'
import ContactButtons from '@/components/dashboard/ContactButtons'
import { formatDate, formatDateTime, getISTDateStr, expiredMembershipMessage } from '@/lib/utils'

const INITIAL_VISIBLE = 8

// Separate from the plain "Today's Check-Ins" list on purpose — this one is
// specifically an anomaly/follow-up view (who punched in with no active
// membership) and is the only Dashboard widget with a date picker, so staff
// can check any past day, not just today.
export default function ExpiredCheckInsPanel({
  initialData,
  initialDate,
}: {
  initialData: RecentCheckIn[]
  initialDate: string
}) {
  const [date, setDate] = useState(initialDate)
  const [checkIns, setCheckIns] = useState(
    initialData.filter(c => c.membershipStatus === 'expired' || c.membershipStatus === 'none')
  )
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const todayIST = getISTDateStr()
  const isToday = date === todayIST

  async function loadDate(nextDate: string) {
    setDate(nextDate)
    setLoading(true)
    setShowAll(false)
    const data = await getCheckInsForDate(nextDate)
    setCheckIns(data.filter(c => c.membershipStatus === 'expired' || c.membershipStatus === 'none'))
    setLoading(false)
  }

  const visible = showAll ? checkIns : checkIns.slice(0, INITIAL_VISIBLE)

  return (
    <div className="bg-card rounded-2xl border border-red-500/20 overflow-hidden animate-fade-in-up card-hover">
      <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Checked In After Expiry</h2>
            <p className="text-muted-foreground text-[11px]">Members with no active membership who still punched in on the device</p>
          </div>
          {checkIns.length > 0 && (
            <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 font-medium">
              {checkIns.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
            <input
              type="date"
              value={date}
              max={todayIST}
              onChange={e => loadDate(e.target.value)}
              className="pl-8 pr-2.5 py-1.5 bg-secondary border border-border rounded-lg text-xs text-foreground"
            />
          </div>
          {!isToday && (
            <button
              onClick={() => loadDate(todayIST)}
              className="px-2.5 py-1.5 bg-secondary border border-border hover:bg-muted rounded-lg text-xs text-muted-foreground transition-colors"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : checkIns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <ShieldAlert className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            No expired check-ins {isToday ? 'today' : `on ${formatDate(date)}`}
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {visible.map((c, i) => (
              <div key={`${c.memberId ?? c.fullName}-${i}`} className="flex items-center justify-between px-5 py-3 table-row-hover gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/15 flex items-center justify-center shrink-0">
                    <span className="text-red-400 text-xs font-bold">{c.fullName.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    {c.memberId ? (
                      <Link href={`/members/${c.memberId}`} className="text-foreground text-sm font-medium hover:text-primary transition-colors truncate block">
                        {c.fullName} <span className="text-muted-foreground/60 font-normal">#{c.memberNumber}</span>
                      </Link>
                    ) : (
                      <p className="text-foreground text-sm font-medium truncate">{c.fullName}</p>
                    )}
                    <p className="text-muted-foreground/60 text-xs">
                      {c.mobile ?? '—'} · Checked in {formatDateTime(c.timestamp)}
                      {c.expiryDate ? ` · expired ${formatDate(c.expiryDate)}` : ' · no membership on record'}
                    </p>
                  </div>
                </div>
                {c.memberId && (
                  <div className="flex items-center gap-2 shrink-0">
                    {c.mobile && (
                      <ContactButtons
                        memberId={c.memberId}
                        mobile={c.mobile}
                        message={expiredMembershipMessage(c.fullName, c.expiryDate)}
                        messageType="expired"
                      />
                    )}
                    <Link
                      href={`/members/${c.memberId}?renew=1`}
                      className="inline-flex items-center gap-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Renew
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
          {checkIns.length > INITIAL_VISIBLE && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-primary hover:text-primary/70 font-medium border-t border-border transition-colors"
            >
              {showAll ? (
                <>Show less <ChevronUp className="w-3.5 h-3.5" /></>
              ) : (
                <>View all {checkIns.length} <ChevronDown className="w-3.5 h-3.5" /></>
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
