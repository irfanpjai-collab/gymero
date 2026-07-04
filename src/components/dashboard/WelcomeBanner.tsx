'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  Search, 
  Check, 
  UserPlus, 
  IndianRupee, 
  MessageSquare, 
  Clock, 
  UserCheck, 
  Flame, 
  X,
  Sparkles
} from 'lucide-react'

interface Member {
  id: string
  member_id: number
  full_name: string
  mobile: string
  email?: string | null
  active_membership?: {
    id: string
    expiry_date: string
    status: string
    plan_id: string
    start_date: string
    amount: number
  } | null
}

const MOTIVATIONAL_QUOTES = [
  "No pain, no gain! 🏋️‍♂️",
  "Your only limit is you. ⚡",
  "Sweat is just fat crying. 💪",
  "Consistency is the key to success. 🔥",
  "Make yourself proud today. 🏆",
  "The only bad workout is the one that didn't happen. 🌟",
  "Action is the foundational key to all success. 🎯",
  "Discipline beats motivation every single time. 👑"
]

export default function WelcomeBanner({ members, gracePeriodDays }: { members: Member[]; gracePeriodDays: number }) {
  const [time, setTime] = useState('')
  const [greeting, setGreeting] = useState('')
  const [quote, setQuote] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Member[]>([])
  const [checkedInList, setCheckedInList] = useState<Array<{ id: string; name: string; time: string }>>([])
  const [toast, setToast] = useState<string | null>(null)

  // Initialize clock and greeting
  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      
      // Formatting time (HH:MM:SS AM/PM) in IST/local
      setTime(now.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }))

      const hour = now.getHours()
      if (hour < 12) {
        setGreeting('Rise & Grind, Admin! ☀️')
      } else if (hour < 17) {
        setGreeting('Power Session, Admin! 💪')
      } else {
        setGreeting('Peak Hours, Admin! 🔥')
      }
    }

    updateClock()
    const timer = setInterval(updateClock, 1000)
    
    // Choose random quote
    const randomQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)]
    setQuote(randomQuote)

    return () => clearInterval(timer)
  }, [])

  // Handle Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = members.filter(member => 
      member.full_name.toLowerCase().includes(query) ||
      member.member_id.toString().includes(query) ||
      member.mobile.includes(query)
    ).slice(0, 4) // Show top 4 results

    setSearchResults(filtered)
  }, [searchQuery, members])

  // Get status label and theme
  const getStatus = (member: Member) => {
    if (!member.active_membership) {
      return { label: 'No Plan', style: 'bg-red-500/10 text-red-400 border border-red-500/20' }
    }

    const expiry = new Date(member.active_membership.expiry_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (member.active_membership.status === 'cancelled') {
      return { label: 'Cancelled', style: 'bg-gray-500/10 text-gray-400 border border-gray-500/20' }
    }

    if (expiry < today) {
      const diffTime = Math.abs(today.getTime() - expiry.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      if (diffDays <= gracePeriodDays) {
        return { label: 'Grace Period', style: 'bg-orange-500/10 text-orange-400 border border-orange-500/20' }
      }
      return { label: 'Expired', style: 'bg-red-500/10 text-red-400 border border-red-500/20' }
    }

    return { label: 'Active', style: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' }
  }

  // Handle Check-in Action
  const handleCheckIn = (member: Member) => {
    const isAlreadyCheckedIn = checkedInList.some(item => item.id === member.id)
    if (isAlreadyCheckedIn) {
      setToast(`${member.full_name} is already checked in.`)
      setTimeout(() => setToast(null), 3000)
      setSearchQuery('')
      return
    }

    const checkInTime = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })

    setCheckedInList(prev => [{ id: member.id, name: member.full_name, time: checkInTime }, ...prev])
    setToast(`Checked in: ${member.full_name} at ${checkInTime} 🎉`)
    setTimeout(() => setToast(null), 3000)
    setSearchQuery('')
  }

  // Handle Remove Check-in
  const removeCheckIn = (id: string) => {
    setCheckedInList(prev => prev.filter(item => item.id !== id))
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border min-h-[260px] lg:min-h-[220px] flex flex-col justify-between p-6 md:p-8 shadow-card card-hover transition-all duration-300">
      {/* Banner Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center z-0 scale-105" 
        style={{ backgroundImage: 'url("/gym_banner.png")' }} 
      />
      {/* High-legibility overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/80 to-black/45 z-10" />

      {/* Main Content (Z-indexed) */}
      <div className="relative z-20 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center w-full">
        
        {/* Left Side: Greeting, Clock, Quote */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
              <Flame className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-white tracking-tight uppercase">
                {greeting || 'Welcome back, Admin!'}
              </h1>
              <p className="text-primary text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                {quote || "Consistency is the key to success. 🔥"}
              </p>
            </div>
          </div>

          {/* Time & Digital Clock */}
          <div className="flex items-center gap-2 text-white/80">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-sm font-mono tracking-widest bg-black/40 px-2 py-1 rounded border border-white/5">
              {time || '--:--:-- --'}
            </span>
            <span className="text-xs text-white/60">Live Gym Console</span>
          </div>

          {/* Quick Actions Row */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link 
              href="/members/new"
              className="inline-flex items-center gap-1.5 text-xs bg-primary hover:bg-primary/95 text-black rounded-lg px-3 py-2 font-semibold shadow-md shadow-primary/20 transition-all hover:scale-105 duration-200"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Member
            </Link>
            <Link 
              href="/payments"
              className="inline-flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/15 text-white border border-white/10 rounded-lg px-3 py-2 font-semibold transition-all hover:scale-105 duration-200"
            >
              <IndianRupee className="w-3.5 h-3.5 text-primary" />
              Payments
            </Link>
            <Link 
              href="/whatsapp"
              className="inline-flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/15 text-white border border-white/10 rounded-lg px-3 py-2 font-semibold transition-all hover:scale-105 duration-200"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              Reminders
            </Link>
          </div>
        </div>

        {/* Right Side: Interactive Search & Session Check-in */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-black/60 backdrop-blur-md rounded-xl p-4 border border-white/10 space-y-3 shadow-inner relative">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-white/40" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Quick check-in (Name, ID, Mobile)..."
                className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <X className="h-3.5 w-3.5 text-white/40 hover:text-white" />
                </button>
              )}
            </div>

            {/* Float Dropdown Search Results */}
            {searchQuery && (
              <div className="absolute left-4 right-4 top-14 bg-card-elevated border border-border rounded-xl shadow-xl z-50 overflow-hidden divide-y divide-border">
                {searchResults.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    No members found
                  </div>
                ) : (
                  searchResults.map(member => {
                    const status = getStatus(member)
                    return (
                      <div key={member.id} className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors">
                        <div className="min-w-0 flex-1 mr-2">
                          <p className="font-semibold text-xs text-foreground truncate">{member.full_name}</p>
                          <p className="text-[10px] text-muted-foreground">ID: {member.member_id} · {member.mobile}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${status.style}`}>
                            {status.label}
                          </span>
                          <button
                            onClick={() => handleCheckIn(member)}
                            className="bg-primary hover:bg-primary/95 text-black p-1 rounded-md transition-all scale-95 hover:scale-105"
                            title="Check In"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* Session Check-in Log */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">
                  Session Log ({checkedInList.length})
                </span>
                {checkedInList.length > 0 && (
                  <button 
                    onClick={() => setCheckedInList([])}
                    className="text-[9px] text-primary hover:underline font-semibold"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {checkedInList.length === 0 ? (
                <div className="text-[11px] text-white/30 italic flex items-center justify-center py-2 bg-white/2 rounded-lg border border-white/5 border-dashed">
                  Search & check in members above.
                </div>
              ) : (
                <div className="max-h-[64px] overflow-y-auto space-y-1.5 pr-1">
                  {checkedInList.map((item) => (
                    <div 
                      key={item.id} 
                      className="flex items-center justify-between bg-white/5 rounded-lg px-2.5 py-1.5 border border-white/5 animate-scale-in"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Check className="w-3 h-3 text-primary flex-shrink-0" />
                        <span className="text-xs text-white font-medium truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[9px] text-white/40 font-mono">{item.time}</span>
                        <button 
                          onClick={() => removeCheckIn(item.id)}
                          className="text-white/30 hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Interactive Toast Notifications inside the banner */}
      {toast && (
        <div className="absolute bottom-4 left-4 right-4 bg-primary text-black text-xs font-bold py-2 px-3 rounded-lg flex items-center gap-2 z-30 shadow-lg animate-fade-in-up border border-primary/20">
          <Check className="w-4 h-4 bg-black/10 rounded-full p-0.5" />
          <span>{toast}</span>
        </div>
      )}

    </div>
  )
}
