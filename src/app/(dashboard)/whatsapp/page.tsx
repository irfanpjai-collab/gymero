'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, Send, Clock, AlertCircle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getDueMembers, getExpiredMembers, logWhatsAppMessage } from '@/app/actions/whatsapp'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { DueMember } from '@/app/actions/whatsapp'

function buildMessage(member: DueMember, type: 'due_today' | 'due_in_3_days' | 'expired'): string {
  const typeText = type === 'expired'
    ? 'has expired'
    : `is due on ${formatDate(member.expiry_date)}`
  return `Hello ${member.full_name},\n\nYour Fitness membership fee of ${formatCurrency(member.amount)} ${typeText}.\n\nPlease renew your membership to continue uninterrupted access.\n\nThank you,\nFitness`
}

function openWhatsApp(member: DueMember, type: 'due_today' | 'due_in_3_days' | 'expired') {
  const message = buildMessage(member, type)
  const phone = '91' + member.mobile.replace(/\D/g, '').replace(/^0/, '')
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank')
  logWhatsAppMessage(member.id, member.mobile, message, type).catch(console.error)
}

function MemberReminderRow({ member, type }: { member: DueMember; type: 'due_today' | 'due_in_3_days' | 'expired' }) {
  const [sent, setSent] = useState(false)
  const handleSend = () => {
    openWhatsApp(member, type)
    setSent(true)
    toast.success(`Reminder opened for ${member.full_name}`)
  }
  return (
    <div className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${sent ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
          <span className="text-foreground font-medium text-sm">{member.full_name.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <div className="text-foreground font-medium text-sm">{member.full_name}</div>
          <div className="text-muted-foreground text-xs flex items-center gap-2">
            <span>#{member.member_id}</span>
            <span>·</span>
            <span>{member.mobile}</span>
            <span>·</span>
            <span className={type === 'expired' ? 'text-red-400' : type === 'due_today' ? 'text-yellow-400' : 'text-orange-400'}>
              {type === 'expired' ? 'Expired' : `Expires ${formatDate(member.expiry_date)}`}
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={handleSend}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
          sent
            ? 'bg-primary/15 text-primary cursor-default'
            : 'bg-primary hover:bg-primary/90 text-white'
        }`}
        disabled={sent}
      >
        {sent ? <><CheckCircle className="w-3.5 h-3.5" /> Sent</> : <><Send className="w-3.5 h-3.5" /> Send</>}
      </button>
    </div>
  )
}

function Section({ title, icon: Icon, iconColor, members, type, emptyText }: {
  title: string
  icon: React.ElementType
  iconColor: string
  members: DueMember[]
  type: 'due_today' | 'due_in_3_days' | 'expired'
  emptyText: string
}) {
  const [allSent, setAllSent] = useState(false)
  const handleSendAll = () => {
    members.forEach(m => openWhatsApp(m, type))
    setAllSent(true)
    toast.success(`Opened ${members.length} WhatsApp reminders`)
  }
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-foreground font-semibold text-sm">{title}</h2>
            <p className="text-muted-foreground text-xs">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {members.length > 0 && (
          <button onClick={handleSendAll} disabled={allSent}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${allSent ? 'bg-primary/15 text-primary cursor-default' : 'bg-primary hover:bg-primary/90 text-white'}`}>
            {allSent ? 'All Sent' : `Send All (${members.length})`}
          </button>
        )}
      </div>
      <div className="p-4 space-y-2">
        {members.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">{emptyText}</div>
        ) : (
          members.map(m => <MemberReminderRow key={m.id} member={m} type={type} />)
        )}
      </div>
    </div>
  )
}

export default function WhatsAppPage() {
  const [dueToday, setDueToday] = useState<DueMember[]>([])
  const [dueIn3, setDueIn3] = useState<DueMember[]>([])
  const [expired, setExpired] = useState<DueMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [allDue, expiredData] = await Promise.all([
        getDueMembers(),
        getExpiredMembers(),
      ])
      setDueToday(allDue.filter(m => m.type === 'due_today'))
      setDueIn3(allDue.filter(m => m.type === 'due_in_3_days'))
      setExpired(expiredData as unknown as DueMember[])
      setLoading(false)
    }
    load()
  }, [])

  const totalPending = dueToday.length + dueIn3.length + expired.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">WhatsApp Reminders</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {loading ? 'Loading...' : `${totalPending} reminder${totalPending !== 1 ? 's' : ''} pending`}
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 flex items-start gap-3">
        <MessageCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-foreground text-sm font-medium">How WhatsApp reminders work</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Clicking "Send" opens WhatsApp with a pre-filled message for the member. You can review and send from WhatsApp.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="bg-card rounded-2xl border border-border h-40 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          <Section
            title="Due Today"
            icon={AlertCircle}
            iconColor="bg-yellow-500/15 text-yellow-400"
            members={dueToday}
            type="due_today"
            emptyText="No memberships due today"
          />
          <Section
            title="Expiring in 3 Days"
            icon={Clock}
            iconColor="bg-orange-500/15 text-orange-400"
            members={dueIn3}
            type="due_in_3_days"
            emptyText="No memberships expiring in the next 3 days"
          />
          <Section
            title="Recently Expired (Last 30 days)"
            icon={MessageCircle}
            iconColor="bg-red-500/15 text-red-400"
            members={expired}
            type="expired"
            emptyText="No recently expired memberships"
          />
        </div>
      )}
    </div>
  )
}
