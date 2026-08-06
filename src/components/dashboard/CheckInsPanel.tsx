'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Fingerprint, LogIn, LogOut, Calendar, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { getCheckInsForDate, type RecentCheckIn } from '@/app/actions/adms'
import ContactButtons from '@/components/dashboard/ContactButtons'
import { formatDate, formatDateTime, getISTDateStr, expiredMembershipMessage } from '@/lib/utils'

const INITIAL_VISIBLE = 8

// Merges what used to be two separate Dashboard widgets ("Today's Check-Ins"
// and "Checked In After Expiry") into one date-scoped panel — both were
// really the same underlying data (device punches + membership status),
// just filtered differently. Defaults to today (IST) and lets staff pick
// any day to see who checked in and who was expired that day, instead of
// today's punches being the only thing visible and expired check-ins being
// an unbounded all-time lookback with no date control.
export default function CheckInsPanel({
  initialData,
  initialDate,
}: {
  initialData: RecentCheckIn[]
  initialDate: string
}) {
  const [date, setDate] = useState(initialDate)
  const [checkIns, setCheckIns] = useState(initialData)
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const todayIST = getISTDateStr()
  const isToday = date === todayIST

  async function loadDate(nextDate: string) {
    setDate(nextDate)
    setLoading(true)
    setShowAll(false)
    const data = await getCheckInsForDate(nextDate)
    setCheckIns(data)
    setLoading(false)
  }

  const expiredCount = checkIns.filter(c => c.membershipStatus === 'expired').length
  const visible = showAll ? checkIns : checkIns.slice(0, INITIAL_VISIBLE)

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in-up card-hover">
      <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Fingerprint className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Check-Ins</h2>
            <p className="text-muted-foreground text-[11px]">
              {checkIns.length} punch{checkIns.length !== 1 ? 'es' : ''}
              {expiredCount > 0 && <span className="text-red-400"> · {expiredCount} expired</span>}
            </p>
          </div>
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
          <Link href="/biometric" className="text-xs text-primary hover:text-primary/70 transition-colors font-medium whitespace-nowrap">
            Biometric page →
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : checkIns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Fingerprint className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            No check-ins {isToday ? 'yet today' : `on ${formatDate(date)}`}
          </p>
          <p className="text-muted-foreground/60 text-xs mt-1">Fingerprint punches will appear here as they happen.</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {visible.map((c, i) => {
              const isIn = c.punch === 0 || c.punch === 4
              const needsAttention = c.membershipStatus === 'expired' || c.membershipStatus === 'none'
              return (
                <div key={`${c.memberId ?? c.fullName}-${i}`} className="flex items-center justify-between px-5 py-3 table-row-hover gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${
                      needsAttention ? 'bg-red-500/10 border-red-500/15' : 'bg-muted border-border'
                    }`}>
                      <span className={`text-xs font-bold ${needsAttention ? 'text-red-400' : 'text-foreground'}`}>
                        {c.fullName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      {c.memberId ? (
                        <Link href={`/members/${c.memberId}`} className="text-foreground text-sm font-medium hover:text-primary transition-colors truncate block">
                          {c.fullName} {c.memberNumber && <span className="text-muted-foreground/60 font-normal">#{c.memberNumber}</span>}
                        </Link>
                      ) : (
                        <p className="text-foreground text-sm font-medium truncate">{c.fullName}</p>
                      )}
                      <p className="text-muted-foreground/60 text-xs inline-flex items-center gap-1 flex-wrap">
                        {isIn ? <LogIn className="w-3 h-3 text-emerald-400" /> : <LogOut className="w-3 h-3 text-blue-400" />}
                        {formatDateTime(c.timestamp)}
                        {c.membershipStatus === 'expired' && c.expiryDate && <span>· expired {formatDate(c.expiryDate)}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {needsAttention && c.memberId && c.mobile && (
                      <>
                        <ContactButtons
                          memberId={c.memberId}
                          mobile={c.mobile}
                          message={expiredMembershipMessage(c.fullName, c.expiryDate)}
                          messageType="expired"
                        />
                        <Link
                          href={`/members/${c.memberId}?renew=1`}
                          className="hidden sm:inline-flex items-center gap-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg px-2 py-1 font-medium transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" /> Renew
                        </Link>
                      </>
                    )}
                    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                      c.membershipStatus === 'active' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                      c.membershipStatus === 'expired' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                      c.membershipStatus === 'coach' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
                      'text-muted-foreground bg-muted/30 border-border'
                    }`}>
                      {c.membershipStatus === 'active' ? 'Active' : c.membershipStatus === 'expired' ? 'Expired' : c.membershipStatus === 'coach' ? 'Coach' : 'No membership'}
                    </span>
                  </div>
                </div>
              )
            })}
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
