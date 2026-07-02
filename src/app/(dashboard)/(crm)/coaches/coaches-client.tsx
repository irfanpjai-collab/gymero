'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Users,
  Plus,
  X,
  Loader2,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
  UserCheck,
} from 'lucide-react'
import { getCoaches, createCoach, getCoachMembers } from '@/app/actions/coaches'
import { Badge } from '@/components/ui/badge'
import type { Coach, Member } from '@/types'

const inputCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-border-bright focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function AddCoachDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [specialization, setSpecialization] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const formData = new FormData()
    formData.set('name', name)
    formData.set('mobile', mobile)
    if (email) formData.set('email', email)
    if (specialization) formData.set('specialization', specialization)
    startTransition(async () => {
      const result = await createCoach(formData)
      if (result.error) { setError(result.error); return }
      setName(''); setMobile(''); setEmail(''); setSpecialization('')
      onSuccess(); onClose()
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-elevated p-6 animate-scale-in">
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold text-foreground mb-5">Add Coach</h2>
        {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Name" required>
            <input type="text" placeholder="e.g. Rajesh Kumar" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Mobile" required>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40 pointer-events-none" />
              <input type="tel" placeholder="9876543210" value={mobile} onChange={(e) => setMobile(e.target.value)} className={`${inputCls} pl-9`} required />
            </div>
          </Field>
          <Field label="Email">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40 pointer-events-none" />
              <input type="email" placeholder="coach@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} pl-9`} />
            </div>
          </Field>
          <Field label="Specialization">
            <input type="text" placeholder="e.g. Weight Training, Yoga..." value={specialization} onChange={(e) => setSpecialization(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border hover:border-border-bright text-muted-foreground hover:text-foreground rounded-xl text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={isPending} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors">
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Add Coach'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CoachAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
      <span className="text-primary font-bold text-sm">{initials}</span>
    </div>
  )
}

function CoachCard({ coach }: { coach: Coach }) {
  const [expanded, setExpanded] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)

  async function handleViewMembers() {
    if (!expanded) {
      setMembersLoading(true)
      const data = await getCoachMembers(coach.id)
      setMembers(data)
      setMembersLoading(false)
    }
    setExpanded((v) => !v)
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-card card-hover">
      <div className="flex items-start gap-4">
        <CoachAvatar name={coach.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-foreground font-semibold">{coach.name}</h3>
            {coach.is_active ? (
              <Badge variant="success" className="text-xs">Active</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Inactive</Badge>
            )}
          </div>
          {coach.specialization && (
            <p className="text-sm text-primary mt-0.5 font-medium">{coach.specialization}</p>
          )}
          <div className="flex flex-col gap-1 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="w-3 h-3" />
              {coach.mobile}
            </div>
            {coach.email && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="w-3 h-3" />
                {coach.email}
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={handleViewMembers}
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-muted hover:bg-border border border-border hover:border-border-bright text-muted-foreground hover:text-foreground rounded-xl text-xs font-medium transition-colors"
      >
        <UserCheck className="w-3.5 h-3.5" />
        View Members
        {expanded ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>

      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          {membersLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs py-2 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />Loading members…
            </div>
          ) : members.length === 0 ? (
            <p className="text-muted-foreground/50 text-xs text-center py-2">No members assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs bg-muted/50 rounded-lg px-3 py-2">
                  <Link href={`/members/${m.id}`} className="text-foreground font-medium hover:text-primary hover:underline transition-colors">
                    {m.full_name}
                  </Link>
                  <span className="text-muted-foreground">#{m.member_id} · {m.mobile}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function CoachesClient({ initialCoaches }: { initialCoaches: Coach[] }) {
  const [coaches, setCoaches] = useState<Coach[]>(initialCoaches)
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function load() {
    setLoading(true)
    const data = await getCoaches()
    setCoaches(data)
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <AddCoachDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSuccess={load} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Coaches</h1>
            <p className="text-muted-foreground text-xs">{coaches.length} coach{coaches.length !== 1 ? 'es' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors shadow-md shadow-primary/20"
        >
          <Plus className="w-4 h-4" />
          Add Coach
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center">
          <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm mt-3">Loading coaches…</p>
        </div>
      ) : coaches.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-muted-foreground/40" />
          </div>
          <p className="text-foreground font-semibold">No coaches yet</p>
          <p className="text-muted-foreground text-sm mt-1">Add your first coach using the button above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {coaches.map((coach) => (
            <CoachCard key={coach.id} coach={coach} />
          ))}
        </div>
      )}
    </div>
  )
}
