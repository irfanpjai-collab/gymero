'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Fingerprint, LogIn, LogOut, ChevronDown, ChevronUp } from 'lucide-react'
import type { RecentCheckIn } from '@/app/actions/adms'
import { formatDateTime, groupCheckInsByPerson } from '@/lib/utils'

const INITIAL_VISIBLE = 6

function groupKey(c: RecentCheckIn): string {
  return c.memberId ?? c.fullName
}

// Grouped one row per person (same pattern as the Biometric page's
// Attendance tab and ExpiredCheckInsPanel) instead of one row per punch, and
// capped to a handful of rows by default — this widget is a quick glance,
// the full uncapped list already lives on /biometric.
export default function TodaysCheckInsCard({ checkIns }: { checkIns: RecentCheckIn[] }) {
  const [showAll, setShowAll] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const groups = groupCheckInsByPerson(checkIns, groupKey, c => c.timestamp)
  const visible = showAll ? groups : groups.slice(0, INITIAL_VISIBLE)

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in-up card-hover">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Fingerprint className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Today&apos;s Check-Ins</h2>
            <p className="text-muted-foreground text-[11px]">Biometric device activity</p>
          </div>
          {groups.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-medium">
              {groups.length}
            </span>
          )}
        </div>
        <Link href="/biometric" className="text-xs text-primary hover:text-primary/70 transition-colors font-medium">
          Biometric page →
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Fingerprint className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">No check-ins yet today</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Fingerprint punches will appear here as they happen.</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {visible.map((group) => {
              const c = group.latest
              const isIn = c.punch === 0 || c.punch === 4
              const expanded = expandedGroups.has(group.key)
              return (
                <div key={group.key}>
                  <div
                    onClick={() => group.all.length > 1 && toggleGroup(group.key)}
                    className={`flex items-center justify-between px-5 py-3 table-row-hover ${group.all.length > 1 ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                        <span className="text-foreground text-xs font-bold">{c.fullName.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {group.all.length > 1 && (expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />)}
                          {c.memberId ? (
                            <Link href={`/members/${c.memberId}`} onClick={e => e.stopPropagation()} className="text-foreground text-sm font-medium hover:text-primary transition-colors truncate block">
                              {c.fullName} {c.memberNumber && <span className="text-muted-foreground/60 font-normal">#{c.memberNumber}</span>}
                            </Link>
                          ) : (
                            <p className="text-foreground text-sm font-medium truncate">{c.fullName}</p>
                          )}
                          {group.all.length > 1 && (
                            <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">{group.all.length}</span>
                          )}
                        </div>
                        <p className="text-muted-foreground/60 text-xs inline-flex items-center gap-1">
                          {isIn ? <LogIn className="w-3 h-3 text-emerald-400" /> : <LogOut className="w-3 h-3 text-blue-400" />}
                          {formatDateTime(c.timestamp)}
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ml-3 ${
                      c.membershipStatus === 'active' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                      c.membershipStatus === 'expired' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                      c.membershipStatus === 'coach' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
                      'text-muted-foreground bg-muted/30 border-border'
                    }`}>
                      {c.membershipStatus === 'active' ? 'Active' : c.membershipStatus === 'expired' ? 'Expired' : c.membershipStatus === 'coach' ? 'Coach' : 'No membership'}
                    </span>
                  </div>
                  {expanded && group.all.slice(1).map((a, i) => {
                    const wasIn = a.punch === 0 || a.punch === 4
                    return (
                      <div key={i} className="px-5 py-2 pl-[4.25rem] bg-muted/10 text-xs text-muted-foreground inline-flex items-center gap-1 w-full border-t border-border/50">
                        ↳ {wasIn ? <LogIn className="w-3 h-3 text-emerald-400" /> : <LogOut className="w-3 h-3 text-blue-400" />}
                        {formatDateTime(a.timestamp)}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          {groups.length > INITIAL_VISIBLE && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-primary hover:text-primary/70 font-medium border-t border-border transition-colors"
            >
              {showAll ? (
                <>Show less <ChevronUp className="w-3.5 h-3.5" /></>
              ) : (
                <>View all {groups.length} <ChevronDown className="w-3.5 h-3.5" /></>
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
