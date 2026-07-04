'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
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
  UserPlus,
  UserMinus,
  Search,
  Dumbbell,
  Settings2,
} from 'lucide-react'
import { getCoaches, createCoach, getCoachMembers, assignMember, unassignMember } from '@/app/actions/coaches'
import { getMembers } from '@/app/actions/members'
import { getPtPlans, createPtPlan, getCoachPtClients, type PtClient } from '@/app/actions/pt'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { Coach, Member, PtPlan } from '@/types'

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

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-elevated p-6 animate-scale-in max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold text-foreground mb-5">{title}</h2>
        {children}
      </div>
    </div>
  )
}

// ─── Add Coach ────────────────────────────────────────────────────────────────

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

  return (
    <Modal open={open} onClose={onClose} title="Add Coach">
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
          <input type="text" placeholder="e.g. Personal Trainer, Yoga..." value={specialization} onChange={(e) => setSpecialization(e.target.value)} className={inputCls} />
        </Field>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border hover:border-border-bright text-muted-foreground hover:text-foreground rounded-xl text-sm transition-colors">Cancel</button>
          <button type="submit" disabled={isPending} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors">
            {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Add Coach'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── PT plan management ───────────────────────────────────────────────────────

function AddPtPlanDialog({ open, onClose, onSuccess, plans }: { open: boolean; onClose: () => void; onSuccess: () => void; plans: PtPlan[] }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [durationMonths, setDurationMonths] = useState('1')
  const [fee, setFee] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await createPtPlan({
        name,
        duration_months: parseInt(durationMonths, 10) || 1,
        fee: parseFloat(fee) || 0,
        description: description || undefined,
      })
      if (result.error) { setError(result.error); return }
      setName(''); setDurationMonths('1'); setFee(''); setDescription('')
      onSuccess()
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage PT Plans">
      {plans.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Existing Plans</p>
          {plans.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm bg-muted/50 rounded-lg px-3 py-2">
              <span className="text-foreground font-medium">{p.name}</span>
              <span className="text-muted-foreground text-xs">{p.duration_months}mo · ₹{p.fee}</span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Add New Plan</p>
        <Field label="Plan Name" required>
          <input type="text" placeholder="e.g. PT - Monthly" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (months)" required>
            <input type="number" min="1" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Fee (₹)" required>
            <input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} className={inputCls} required />
          </Field>
        </div>
        <Field label="Description">
          <input type="text" placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </Field>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border hover:border-border-bright text-muted-foreground hover:text-foreground rounded-xl text-sm transition-colors">Close</button>
          <button type="submit" disabled={isPending} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors">
            {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Add Plan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Member search picker (shared by assign + sell-PT dialogs) ───────────────

function MemberSearchPicker({ onSelect, excludeIds }: { onSelect: (member: Member) => void; excludeIds?: Set<string> }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Member[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce is driven from the onChange handler itself, not an effect keyed
  // on `query` — this is a user-initiated search, not state sync with an
  // external system, so it belongs in the event handler.
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const filtered = (excludeIds ? results.filter((m) => !excludeIds.has(m.id)) : results)
  const hasQuery = query.trim().length > 0

  function handleChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setResults([]); setSearching(false); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const data = await getMembers(value.trim())
      setResults(data.slice(0, 8))
      setSearching(false)
    }, 300)
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, mobile, or member ID..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          className={`${inputCls} pl-9`}
        />
      </div>
      {searching && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs py-2 justify-center">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />Searching…
        </div>
      )}
      {!searching && hasQuery && filtered.length === 0 && (
        <p className="text-muted-foreground/50 text-xs text-center py-2">No matching members.</p>
      )}
      {filtered.length > 0 && (
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m)}
              className="w-full flex items-center justify-between text-sm bg-muted/50 hover:bg-muted rounded-lg px-3 py-2 transition-colors text-left"
            >
              <span className="text-foreground font-medium">{m.full_name}</span>
              <span className="text-muted-foreground text-xs">#{m.member_id} · {m.mobile}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Assign member to coach ───────────────────────────────────────────────────

function AssignMemberDialog({ open, onClose, onSuccess, coach, assignedIds }: {
  open: boolean; onClose: () => void; onSuccess: () => void; coach: Coach; assignedIds: Set<string>
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleSelect(member: Member) {
    setError('')
    startTransition(async () => {
      const result = await assignMember(coach.id, member.id)
      if (result.error) { setError(result.error); return }
      onSuccess()
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={`Assign Member to ${coach.name}`}>
      {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">{error}</p>}
      {isPending ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />Assigning…
        </div>
      ) : (
        <MemberSearchPicker onSelect={handleSelect} excludeIds={assignedIds} />
      )}
    </Modal>
  )
}

// ─── Coach card ───────────────────────────────────────────────────────────────

function CoachAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
      <span className="text-primary font-bold text-sm">{initials}</span>
    </div>
  )
}

function PtStatusBadge({ status }: { status: PtClient['status'] }) {
  if (status === 'active') return <Badge variant="success" className="text-xs">Active</Badge>
  if (status === 'expired') return <Badge variant="danger" className="text-xs">Expired</Badge>
  return <Badge variant="secondary" className="text-xs">Cancelled</Badge>
}

function CoachCard({ coach }: { coach: Coach }) {
  const [membersOpen, setMembersOpen] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)

  const [ptOpen, setPtOpen] = useState(false)
  const [ptClients, setPtClients] = useState<PtClient[]>([])
  const [ptLoading, setPtLoading] = useState(false)
  const [, startTransition] = useTransition()

  async function loadMembers() {
    setMembersLoading(true)
    const data = await getCoachMembers(coach.id)
    setMembers(data)
    setMembersLoading(false)
  }

  async function loadPtClients() {
    setPtLoading(true)
    const data = await getCoachPtClients(coach.id)
    setPtClients(data)
    setPtLoading(false)
  }

  async function handleToggleMembers() {
    if (!membersOpen) await loadMembers()
    setMembersOpen((v) => !v)
  }

  async function handleTogglePt() {
    if (!ptOpen) await loadPtClients()
    setPtOpen((v) => !v)
  }

  function handleUnassign(memberId: string) {
    startTransition(async () => {
      await unassignMember(coach.id, memberId)
      loadMembers()
    })
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-card card-hover">
      <AssignMemberDialog
        open={assignDialogOpen}
        onClose={() => setAssignDialogOpen(false)}
        onSuccess={loadMembers}
        coach={coach}
        assignedIds={new Set(members.map((m) => m.id))}
      />

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

      {/* Members section */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={handleToggleMembers}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-muted hover:bg-border border border-border hover:border-border-bright text-muted-foreground hover:text-foreground rounded-xl text-xs font-medium transition-colors"
        >
          <UserCheck className="w-3.5 h-3.5" />
          Members
          {membersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={handleTogglePt}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-muted hover:bg-border border border-border hover:border-border-bright text-muted-foreground hover:text-foreground rounded-xl text-xs font-medium transition-colors"
        >
          <Dumbbell className="w-3.5 h-3.5" />
          PT Clients
          {ptOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {membersOpen && (
        <div className="mt-3 border-t border-border pt-3 space-y-2">
          <button
            onClick={() => setAssignDialogOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg px-3 py-2 font-medium transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Assign Member
          </button>
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
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">#{m.member_id} · {m.mobile}</span>
                    <button
                      onClick={() => handleUnassign(m.id)}
                      title="Unassign"
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {ptOpen && (
        <div className="mt-3 border-t border-border pt-3 space-y-2">
          <p className="text-muted-foreground/60 text-[11px] text-center">
            PT packages are assigned from a member&apos;s own page.
          </p>
          {ptLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs py-2 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />Loading PT clients…
            </div>
          ) : ptClients.length === 0 ? (
            <p className="text-muted-foreground/50 text-xs text-center py-2">No PT clients yet.</p>
          ) : (
            <div className="space-y-2">
              {ptClients.map((c) => (
                <div key={c.ptMembershipId} className="flex items-center justify-between text-xs bg-muted/50 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/members/${c.memberId}`} className="text-foreground font-medium hover:text-primary hover:underline transition-colors">
                      {c.fullName}
                    </Link>
                    <p className="text-muted-foreground mt-0.5">{c.planName} · expires {formatDate(c.expiryDate)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <PtStatusBadge status={c.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoachesClient({ initialCoaches, ptPlans: initialPtPlans }: { initialCoaches: Coach[]; ptPlans: PtPlan[] }) {
  const [coaches, setCoaches] = useState<Coach[]>(initialCoaches)
  const [ptPlans, setPtPlans] = useState<PtPlan[]>(initialPtPlans)
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [ptPlanDialogOpen, setPtPlanDialogOpen] = useState(false)

  async function load() {
    setLoading(true)
    const data = await getCoaches()
    setCoaches(data)
    setLoading(false)
  }

  async function loadPtPlans() {
    const data = await getPtPlans()
    setPtPlans(data)
  }

  return (
    <div className="space-y-5">
      <AddCoachDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSuccess={load} />
      <AddPtPlanDialog open={ptPlanDialogOpen} onClose={() => setPtPlanDialogOpen(false)} onSuccess={loadPtPlans} plans={ptPlans} />

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPtPlanDialogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-border hover:border-border-bright text-muted-foreground hover:text-foreground rounded-xl transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            Manage PT Plans
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors shadow-md shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            Add Coach
          </button>
        </div>
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
