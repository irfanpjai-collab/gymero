'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Dumbbell, Loader2, ChevronDown, Calendar, AlertCircle, Ban } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { assignPtMembership, cancelPtMembership, getPtPlans } from '@/app/actions/pt'
import { getCoaches } from '@/app/actions/coaches'
import type { Coach, PtPlan } from '@/types'

const today = new Date().toISOString().slice(0, 10)

const inputCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors'

const selectCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground transition-colors appearance-none'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export function PtDialog({
  memberId,
  label = 'Add PT',
  className = '',
}: {
  memberId: string
  label?: string
  className?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [plans, setPlans] = useState<PtPlan[]>([])
  const [loading, setLoading] = useState(false)
  const [coachId, setCoachId] = useState('')
  const [planId, setPlanId] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [amountNote, setAmountNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (v && coaches.length === 0 && plans.length === 0) {
      setLoading(true)
      Promise.all([getCoaches(), getPtPlans()]).then(([coachData, planData]) => {
        setCoaches(coachData)
        setPlans(planData)
        setLoading(false)
      })
    }
    if (!v) {
      setCoachId(''); setPlanId(''); setStartDate(today)
      setAmount(''); setAmountNote(''); setPaymentMethod('cash')
    }
  }

  function handlePlanChange(id: string) {
    setPlanId(id)
    const plan = plans.find((p) => p.id === id)
    if (plan) setAmount(String(plan.fee))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!coachId || !planId) return

    startTransition(async () => {
      const result = await assignPtMembership({
        member_id: memberId,
        coach_id: coachId,
        plan_id: planId,
        start_date: startDate,
        amount: parseFloat(amount) || 0,
        amount_note: amountNote.trim() || undefined,
        payment_method: paymentMethod,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success('PT package added!')
      setOpen(false)
      router.refresh()
    })
  }

  const selectedPlan = plans.find((p) => p.id === planId)
  const expiryPreview = selectedPlan
    ? (() => {
        const d = new Date(startDate)
        d.setMonth(d.getMonth() + selectedPlan.duration_months)
        return d.toLocaleDateString('en-GB')
      })()
    : null

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors ${className}`}
      >
        <Dumbbell className="w-3.5 h-3.5" />
        {label}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-primary" />
              Add Personal Training
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading…
              </div>
            ) : coaches.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                No coaches exist yet. Add one from the Coaches page first.
              </p>
            ) : plans.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                No PT plans exist yet. Add one from the Coaches page first.
              </p>
            ) : (
              <>
                <Field label="Coach / Trainer" required>
                  <div className="relative">
                    <select value={coachId} onChange={(e) => setCoachId(e.target.value)} required className={selectCls}>
                      <option value="">Select a coach…</option>
                      {coaches.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}{c.specialization ? ` — ${c.specialization}` : ''}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </Field>

                <Field label="PT Plan" required>
                  <div className="relative">
                    <select value={planId} onChange={(e) => handlePlanChange(e.target.value)} required className={selectCls}>
                      <option value="">Select a plan…</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} — {p.duration_months}mo — ₹{p.fee}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Date" required>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className={`${inputCls} pl-9`} />
                    </div>
                  </Field>
                  <Field label="Amount (₹)" required>
                    <input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} required className={inputCls} />
                  </Field>
                </div>

                {selectedPlan && parseFloat(amount || '0') !== selectedPlan.fee && (
                  <Field label={`Reason — amount differs from plan price (₹${selectedPlan.fee})`} required>
                    <div className="relative">
                      <AlertCircle className="absolute left-3 top-3 w-3.5 h-3.5 text-amber-400 pointer-events-none" />
                      <input type="text" value={amountNote} onChange={(e) => setAmountNote(e.target.value)} required placeholder="e.g. discount applied" className={`${inputCls} pl-9`} />
                    </div>
                  </Field>
                )}

                <Field label="Payment Method" required>
                  <div className="relative">
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} required className={selectCls}>
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </Field>

                {expiryPreview && (
                  <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2 border border-border">
                    Expires: <span className="text-foreground font-medium">{expiryPreview}</span>
                  </div>
                )}
              </>
            )}

            <DialogFooter className="pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || loading || coaches.length === 0 || plans.length === 0 || !coachId || !planId}
                className="inline-flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {isPending ? (<><Loader2 className="w-4 h-4 animate-spin" />Saving…</>) : (<><Dumbbell className="w-4 h-4" />Add PT</>)}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function CancelPtButton({ ptMembershipId }: { ptMembershipId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await cancelPtMembership(ptMembershipId)
      if (result.error) { toast.error(result.error); return }
      toast.success('PT package cancelled')
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border hover:bg-muted text-muted-foreground hover:text-red-400 rounded-lg transition-colors disabled:opacity-50"
    >
      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
      Cancel PT
    </button>
  )
}
