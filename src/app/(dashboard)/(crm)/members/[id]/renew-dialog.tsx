'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCw, Loader2, ChevronDown, Calendar, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { renewMembership, getPlans, getLastMembershipExpiry } from '@/app/actions/memberships'
import type { MembershipPlan } from '@/types'
import { differenceInDays, parseISO, addDays, format } from 'date-fns'

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

export default function RenewDialog({
  memberId,
  defaultOpen = false,
  label = 'Renew',
  className = '',
}: {
  memberId: string
  defaultOpen?: boolean
  label?: string
  className?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [isPending, startTransition] = useTransition()
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [amountNote, setAmountNote] = useState('')

  const [admissionFee, setAdmissionFee] = useState('0')
  const [needsAdmissionFee, setNeedsAdmissionFee] = useState(false)
  const [lastExpiryDate, setLastExpiryDate] = useState<string | null>(null)
  const [defaultAdmissionFee, setDefaultAdmissionFee] = useState(1000)
  const [gracePeriodDays, setGracePeriodDays] = useState(180)
  const [daysSince, setDaysSince] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')

  // Load default settings from local storage
  useEffect(() => {
    const saved = localStorage.getItem('gym_settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.admissionFee !== undefined) setDefaultAdmissionFee(Number(parsed.admissionFee))
      if (parsed.gracePeriodDays !== undefined) setGracePeriodDays(Number(parsed.gracePeriodDays))
    }
  }, [])

  useEffect(() => {
    if (open) {
      if (plans.length === 0 && !plansLoading) {
        setPlansLoading(true)
        getPlans().then((data) => {
          setPlans(data)
          setPlansLoading(false)
        })
      }

      // Fetch last membership expiry to determine if admission fee is required
      getLastMembershipExpiry(memberId).then((expiry) => {
        setLastExpiryDate(expiry)
        if (!expiry) {
          setNeedsAdmissionFee(true)
          setAdmissionFee(String(defaultAdmissionFee))
          setStartDate(today)
        } else {
          // If membership has expired, calculate days since expiry
          const expiryDateObj = parseISO(expiry)
          const days = differenceInDays(new Date(), expiryDateObj)
          setDaysSince(days)
          if (days > gracePeriodDays) {
            setNeedsAdmissionFee(true)
            setAdmissionFee(String(defaultAdmissionFee))
          } else {
            setNeedsAdmissionFee(false)
            setAdmissionFee('0')
          }

          // Logical fix: Default start date to the day after expiry if expiry is in the future (overlapping fix)
          if (days < 0) {
            const nextDay = addDays(expiryDateObj, 1)
            setStartDate(format(nextDay, 'yyyy-MM-dd'))
          } else {
            setStartDate(today)
          }
        }
      })
    }
  }, [open, plans.length, plansLoading, memberId, defaultAdmissionFee, gracePeriodDays])

  // Auto-fill amount when plan changes
  useEffect(() => {
    if (selectedPlanId && plans.length > 0) {
      const plan = plans.find((p) => p.id === selectedPlanId)
      if (plan) setAmount(String(plan.fee))
    }
  }, [selectedPlanId, plans])

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) {
      // reset state on close
      setSelectedPlanId('')
      setStartDate(today)
      setAmount('')
      setAmountNote('')
      setAdmissionFee('0')
      setNeedsAdmissionFee(false)
      setLastExpiryDate(null)
      setDaysSince(null)
      setPaymentMethod('cash')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPlanId) return

    startTransition(async () => {
      const result = await renewMembership(memberId, {
        plan_id: selectedPlanId,
        start_date: startDate,
        amount: parseFloat(amount) || 0,
        amount_note: amountNote.trim() || undefined,
        admission_fee: parseFloat(admissionFee) || 0,
        payment_method: paymentMethod,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success('Membership renewed successfully!')
      setOpen(false)
      router.refresh()
    })
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId)
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
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors ${className}`}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        {label}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              Renew Membership
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {plansLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading plans…
              </div>
            ) : plans.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                No active plans available. Please create a membership plan first.
              </p>
            ) : (
              <>
                {needsAdmissionFee && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">
                      {lastExpiryDate ? (
                        <>
                          Membership expired on {new Date(lastExpiryDate).toLocaleDateString('en-GB')} ({daysSince} days ago).
                          This exceeds the {gracePeriodDays}-day grace period. An admission fee of ₹{defaultAdmissionFee} is required.
                        </>
                      ) : (
                        <>
                          New member rejoining or has no membership history. Default admission fee of ₹{defaultAdmissionFee} is required.
                        </>
                      )}
                    </p>
                  </div>
                )}

                {/* Plan */}
                <Field label="Plan" required>
                  <div className="relative">
                    <select
                      value={selectedPlanId}
                      onChange={(e) => setSelectedPlanId(e.target.value)}
                      required
                      className={selectCls}
                    >
                      <option value="">Select a plan…</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} — {plan.duration_months} month
                          {plan.duration_months !== 1 ? 's' : ''} (₹{plan.fee})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </Field>

                {/* Start Date + Amount */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Date" required>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                        className={`${inputCls} pl-9`}
                      />
                    </div>
                  </Field>
                  <Field label="Amount (₹)" required>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      min={0}
                      step={1}
                      placeholder="0"
                      className={inputCls}
                    />
                  </Field>
                </div>

                {selectedPlan && parseFloat(amount) !== selectedPlan.fee && (
                  <Field label={`Reason — amount differs from plan price (₹${selectedPlan.fee})`} required>
                    <div className="relative">
                      <AlertCircle className="absolute left-3 top-3 w-3.5 h-3.5 text-amber-400 pointer-events-none" />
                      <input
                        type="text"
                        value={amountNote}
                        onChange={(e) => setAmountNote(e.target.value)}
                        required
                        placeholder="e.g. loyalty discount, partial payment"
                        className={`${inputCls} pl-9`}
                      />
                    </div>
                  </Field>
                )}

                {/* Admission Fee field */}
                <Field label={needsAdmissionFee ? "Admission Fee (₹) - Required" : "Admission Fee (₹) - Waived (within grace period)"}>
                  <input
                    type="number"
                    value={admissionFee}
                    onChange={(e) => setAdmissionFee(e.target.value)}
                    min={0}
                    step={1}
                    placeholder="0"
                    className={inputCls}
                  />
                </Field>

                {/* Payment Method */}
                <Field label="Payment Method" required>
                  <div className="relative">
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      required
                      className={selectCls}
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </Field>

                {expiryPreview && (
                  <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2 border border-border">
                    New expiry:{' '}
                    <span className="text-foreground font-medium">{expiryPreview}</span>
                  </div>
                )}
              </>
            )}

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || plansLoading || plans.length === 0 || !selectedPlanId}
                className="inline-flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Renewing…
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Renew
                  </>
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
