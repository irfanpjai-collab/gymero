'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import {
  Dumbbell,
  Plus,
  X,
  Loader2,
  Edit2,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { getPlans, createPlan, updatePlan } from '@/app/actions/memberships'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { MembershipPlan } from '@/types'

const inputCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors'

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

function AddPlanDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [duration, setDuration] = useState('1')
  const [fee, setFee] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await createPlan({
        name,
        duration_months: parseInt(duration),
        fee: parseFloat(fee),
        description: description || undefined,
      })
      if (result.error) { setError(result.error); return }
      setName(''); setDuration('1'); setFee(''); setDescription('')
      onSuccess(); onClose()
    })
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6">
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold text-foreground mb-5">Add Membership Plan</h2>
        {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Plan Name" required>
            <input type="text" placeholder="e.g. Monthly" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (months)" required>
              <input type="number" min="1" max="36" value={duration} onChange={(e) => setDuration(e.target.value)} className={inputCls} required />
            </Field>
            <Field label="Fee (₹)" required>
              <input type="number" min="0" step="1" placeholder="0" value={fee} onChange={(e) => setFee(e.target.value)} className={inputCls} required />
            </Field>
          </div>
          <Field label="Description">
            <textarea rows={2} placeholder="Optional description..." value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} resize-none`} />
          </Field>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={isPending} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors">
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Add Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

function EditPlanForm({ plan, onDone }: { plan: MembershipPlan; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(plan.name)
  const [duration, setDuration] = useState(String(plan.duration_months))
  const [fee, setFee] = useState(String(plan.fee))
  const [description, setDescription] = useState(plan.description ?? '')
  const [isActive, setIsActive] = useState(plan.is_active)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await updatePlan(plan.id, {
        name,
        duration_months: parseInt(duration),
        fee: parseFloat(fee),
        description: description || undefined,
        is_active: isActive,
      })
      if (result.error) { setError(result.error); return }
      onDone()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-border space-y-3">
      {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
      <Field label="Plan Name" required>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Duration (mo)" required>
          <input type="number" min="1" max="36" value={duration} onChange={(e) => setDuration(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="Fee (₹)" required>
          <input type="number" min="0" step="1" value={fee} onChange={(e) => setFee(e.target.value)} className={inputCls} required />
        </Field>
      </div>
      <Field label="Description">
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
      </Field>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <div
          onClick={() => setIsActive((v) => !v)}
          className={`w-9 h-5 rounded-full relative transition-colors ${isActive ? 'bg-primary' : 'bg-muted'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
        <span className="text-sm text-muted-foreground">Active</span>
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="flex-1 px-3 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl text-xs transition-colors">Cancel</button>
        <button type="submit" disabled={isPending} className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-xs font-semibold transition-colors">
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Save
        </button>
      </div>
    </form>
  )
}

function PlanCard({ plan, onUpdate }: { plan: MembershipPlan; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-foreground font-semibold">{plan.name}</h3>
            {plan.is_active ? (
              <Badge variant="success" className="text-xs flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <XCircle className="w-3 h-3" />Inactive
              </Badge>
            )}
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{formatCurrency(plan.fee)}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {plan.duration_months} month{plan.duration_months !== 1 ? 's' : ''}
          </p>
          {plan.description && <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>}
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {editing && (
        <EditPlanForm
          plan={plan}
          onDone={() => { setEditing(false); onUpdate() }}
        />
      )}
    </div>
  )
}

export default function MembershipsClient({ initialPlans }: { initialPlans: MembershipPlan[] }) {
  const [plans, setPlans] = useState<MembershipPlan[]>(initialPlans)
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function load() {
    setLoading(true)
    const data = await getPlans()
    setPlans(data)
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <AddPlanDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSuccess={load} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Membership Plans</h1>
            <p className="text-muted-foreground text-xs">{plans.length} plan{plans.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Plan
        </button>
      </div>

      {/* Plans grid */}
      {loading ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center">
          <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm mt-3">Loading plans…</p>
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Dumbbell className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-foreground font-semibold">No plans yet</p>
          <p className="text-muted-foreground text-sm mt-1">Create your first membership plan above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onUpdate={load} />
          ))}
        </div>
      )}
    </div>
  )
}
