'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  Dumbbell,
  ChevronDown,
  Loader2,
  Info,
} from 'lucide-react'
import { createMember } from '@/app/actions/members'
import { createMembership, getPlans } from '@/app/actions/memberships'
import { getNextMemberId } from '@/app/actions/members'
import { getCoaches } from '@/app/actions/coaches'
import { getPtPlans, assignPtMembership } from '@/app/actions/pt'
import { getExpiryDateFromPlan } from '@/lib/utils'
import type { MembershipPlan, Coach, PtPlan } from '@/types'

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
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

const inputCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors'

const selectCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground transition-colors appearance-none'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewMemberPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const today = new Date().toISOString().slice(0, 10)

  // Member fields
  const [memberId, setMemberId] = useState<string>('')
  const [memberIdLoading, setMemberIdLoading] = useState(true)
  const [admissionFee, setAdmissionFee] = useState<string>('600')

  // Track join date to detect backdated entries
  const [joinDate, setJoinDate] = useState(today)
  const isBackdated = joinDate !== today

  // "Paid now" only applies when joining today; backdated always skips payment
  const [paidNow, setPaidNow] = useState(true)

  // Membership toggle
  const [addMembership, setAddMembership] = useState(false)
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [amountNote, setAmountNote] = useState('')
  // Independent from the admission fee's paidNow above — a member can pay
  // the admission fee today but still owe the membership fee, or vice versa.
  // "Paid now" applies only while the membership's own start date is today;
  // a backdated start always skips the payment record, same reasoning as
  // isBackdated for the admission fee.
  const [membershipPaidNow, setMembershipPaidNow] = useState(true)
  const isMembershipBackdated = startDate !== today

  // Personal Training toggle
  const [addPt, setAddPt] = useState(false)
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [ptPlans, setPtPlans] = useState<PtPlan[]>([])
  const [selectedCoachId, setSelectedCoachId] = useState('')
  const [selectedPtPlanId, setSelectedPtPlanId] = useState('')
  const [ptStartDate, setPtStartDate] = useState(today)
  const [ptAmount, setPtAmount] = useState('')
  const [ptAmountNote, setPtAmountNote] = useState('')

  // Load next member ID + default settings
  useEffect(() => {
    getNextMemberId().then((id) => {
      setMemberId(String(id))
      setMemberIdLoading(false)
    })
    // localStorage isn't available during SSR, so this can't be computed
    // during render without a hydration mismatch — must read after mount.
    const saved = localStorage.getItem('gym_settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.admissionFee !== undefined) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAdmissionFee(String(parsed.admissionFee))
      }
    }
  }, [])

  // Load plans when membership section is toggled on
  useEffect(() => {
    if (addMembership && plans.length === 0) {
      getPlans().then(setPlans)
    }
  }, [addMembership, plans.length])

  // Auto-fills amount as a starting point when the plan changes — staff can
  // still freely edit it afterward, so this has to be an effect (a value
  // derived during render would overwrite their edit on every re-render).
  useEffect(() => {
    if (selectedPlanId && plans.length > 0) {
      const plan = plans.find((p) => p.id === selectedPlanId)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (plan) setAmount(String(plan.fee))
    }
  }, [selectedPlanId, plans])

  // Load coaches + PT plans when PT section is toggled on
  useEffect(() => {
    if (addPt && coaches.length === 0 && ptPlans.length === 0) {
      Promise.all([getCoaches(), getPtPlans()]).then(([coachData, planData]) => {
        setCoaches(coachData)
        setPtPlans(planData)
      })
    }
  }, [addPt, coaches.length, ptPlans.length])

  function handlePtPlanChange(id: string) {
    setSelectedPtPlanId(id)
    const plan = ptPlans.find((p) => p.id === id)
    if (plan) setPtAmount(String(plan.fee))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)

    startTransition(async () => {
      const result = await createMember(formData)

      if (result.error) {
        toast.error(result.error)
        return
      }

      const newMemberId = result.memberId!

      if (addMembership && selectedPlanId && newMemberId) {
        const paymentMethod = formData.get('payment_method') as string
        const membershipResult = await createMembership({
          member_id: newMemberId,
          plan_id: selectedPlanId,
          start_date: startDate,
          amount: parseFloat(amount) || 0,
          amount_note: amountNote.trim() || undefined,
          payment_method: paymentMethod,
          skip_payment: isMembershipBackdated,
          paid_now: isMembershipBackdated ? undefined : membershipPaidNow,
        })

        if (membershipResult.error) {
          toast.error(`Member created but membership failed: ${membershipResult.error}`)
          router.push('/members')
          return
        }
      }

      if (addPt && selectedCoachId && selectedPtPlanId && newMemberId) {
        const paymentMethod = formData.get('payment_method') as string
        const ptResult = await assignPtMembership({
          member_id: newMemberId,
          coach_id: selectedCoachId,
          plan_id: selectedPtPlanId,
          start_date: ptStartDate,
          amount: parseFloat(ptAmount) || 0,
          amount_note: ptAmountNote.trim() || undefined,
          payment_method: paymentMethod,
        })

        if (ptResult.error) {
          toast.error(`Member created but PT package failed: ${ptResult.error}`)
          router.push('/members')
          return
        }
      }

      toast.success('Member added successfully!')
      router.push('/members')
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/members"
          className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-card border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Add New Member</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Fill in the details below</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Member info card */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Member Information</h2>
          </div>

          {/* Member ID + Full Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Member ID" required>
              <input
                type="number"
                name="member_id"
                required
                min={1}
                step={1}
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                placeholder={memberIdLoading ? 'Loading…' : 'e.g. 101'}
                className={inputCls}
              />
            </Field>
            <Field label="Full Name" required>
              <input
                type="text"
                name="full_name"
                required
                placeholder="e.g. Rahul Sharma"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Mobile + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Mobile" required>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
                <input
                  type="tel"
                  name="mobile"
                  required
                  placeholder="9876543210"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>
            <Field label="Email">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
                <input
                  type="email"
                  name="email"
                  placeholder="rahul@example.com"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>
          </div>

          {/* Address */}
          <Field label="Address">
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
              <input
                type="text"
                name="address"
                placeholder="Street, City"
                className={`${inputCls} pl-9`}
              />
            </div>
          </Field>

          {/* Gender + Date Joined + Admission Fee + Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Gender" required>
              <div className="relative">
                <select name="gender" required defaultValue="male" className={selectCls}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </Field>
            <Field label="Date Joined" required>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  name="join_date"
                  value={joinDate}
                  onChange={(e) => setJoinDate(e.target.value)}
                  required
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>
            <Field label="Admission Fee (₹)">
              <input
                type="number"
                name="admission_fee"
                value={admissionFee}
                onChange={(e) => setAdmissionFee(e.target.value)}
                min={0}
                step={1}
                placeholder="0"
                className={inputCls}
              />
            </Field>
            <Field label="Payment Method">
              <div className="relative">
                <select name="payment_method" className={selectCls} defaultValue="cash">
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </Field>
          </div>

          {/* Payment status — hidden when backdated (always skipped for historical entries) */}
          <input type="hidden" name="paid_now" value={String(!isBackdated && paidNow)} />
          {!isBackdated && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setPaidNow((v) => !v)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPaidNow((v) => !v)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer select-none transition-colors ${
                paidNow
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors ${
                paidNow ? 'bg-emerald-500 border-emerald-500' : 'border-amber-500/60 bg-transparent'
              }`}>
                {paidNow && (
                  <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div>
                <p className={`text-sm font-semibold ${paidNow ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {paidNow ? 'Paid now' : 'Payment pending'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {paidNow
                    ? 'Admission fee payment will be recorded'
                    : 'No admission fee payment recorded — visible as pending in Accounts'}
                </p>
              </div>
            </div>
          )}
          {isBackdated && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold">Historical entry</span> — joining date is in the past.
                Membership created for status tracking only, no payment records added.
              </span>
            </div>
          )}

          {/* Notes */}
          <Field label="Notes">
            <div className="relative">
              <FileText className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
              <textarea
                name="notes"
                rows={3}
                placeholder="Any additional notes..."
                className={`${inputCls} pl-9 resize-none min-h-[80px]`}
              />
            </div>
          </Field>
        </div>

        {/* Membership section */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setAddMembership((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Dumbbell className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Membership Plan</p>
                <p className="text-xs text-muted-foreground mt-0.5">Optional — add a plan now or later</p>
              </div>
            </div>
            <div
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                addMembership ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  addMembership ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </div>
          </button>

          {addMembership && (
            <div className="px-6 pb-6 space-y-4 border-t border-border pt-5">
              {plans.length === 0 ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading plans…
                </div>
              ) : (
                <>
                  {/* Plan select */}
                  <Field label="Plan" required={addMembership}>
                    <div className="relative">
                      <select
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                        required={addMembership}
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

                  {/* Start date + Amount */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Start Date" required={addMembership}>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          required={addMembership}
                          className={`${inputCls} pl-9`}
                        />
                      </div>
                    </Field>
                    <Field label="Amount (₹)" required={addMembership}>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required={addMembership}
                        min={0}
                        step={1}
                        placeholder="0"
                        className={inputCls}
                      />
                    </Field>
                  </div>

                  {(() => {
                    const plan = plans.find((p) => p.id === selectedPlanId)
                    if (!plan || parseFloat(amount) === plan.fee) return null
                    return (
                      <Field label={`Reason — amount differs from plan price (₹${plan.fee})`} required={addMembership}>
                        <input
                          type="text"
                          value={amountNote}
                          onChange={(e) => setAmountNote(e.target.value)}
                          required={addMembership}
                          placeholder="e.g. loyalty discount, partial payment"
                          className={inputCls}
                        />
                      </Field>
                    )
                  })()}

                  {selectedPlanId && plans.length > 0 && (
                    <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2 border border-border">
                      {(() => {
                        const plan = plans.find((p) => p.id === selectedPlanId)
                        if (!plan) return null
                        const expiry = new Date(getExpiryDateFromPlan(startDate, plan.duration_months))
                        return (
                          <>
                            Expiry:{' '}
                            <span className="text-foreground font-medium">
                              {expiry.toLocaleDateString('en-GB')}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* Independent of the admission fee's paid-now toggle above —
                      this one only affects the membership payment record. */}
                  {isMembershipBackdated ? (
                    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        <span className="font-semibold">Historical entry</span> — start date is in the past.
                        Membership created for status tracking only, no payment record added.
                      </span>
                    </div>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setMembershipPaidNow((v) => !v)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setMembershipPaidNow((v) => !v)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer select-none transition-colors ${
                        membershipPaidNow
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : 'bg-amber-500/10 border-amber-500/30'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors ${
                        membershipPaidNow ? 'bg-emerald-500 border-emerald-500' : 'border-amber-500/60 bg-transparent'
                      }`}>
                        {membershipPaidNow && (
                          <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${membershipPaidNow ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {membershipPaidNow ? 'Paid now' : 'Payment pending'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {membershipPaidNow
                            ? 'Membership payment will be recorded'
                            : 'Membership created but no payment recorded — visible as pending in Accounts'}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Personal Training section */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setAddPt((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Dumbbell className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Personal Training</p>
                <p className="text-xs text-muted-foreground mt-0.5">Optional — assign a PT package now or later</p>
              </div>
            </div>
            <div
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                addPt ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  addPt ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </div>
          </button>

          {addPt && (
            <div className="px-6 pb-6 space-y-4 border-t border-border pt-5">
              {coaches.length === 0 || ptPlans.length === 0 ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading…
                </div>
              ) : (
                <>
                  <Field label="Coach / Trainer" required={addPt}>
                    <div className="relative">
                      <select
                        value={selectedCoachId}
                        onChange={(e) => setSelectedCoachId(e.target.value)}
                        required={addPt}
                        className={selectCls}
                      >
                        <option value="">Select a coach…</option>
                        {coaches.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}{c.specialization ? ` — ${c.specialization}` : ''}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </Field>

                  <Field label="PT Plan" required={addPt}>
                    <div className="relative">
                      <select
                        value={selectedPtPlanId}
                        onChange={(e) => handlePtPlanChange(e.target.value)}
                        required={addPt}
                        className={selectCls}
                      >
                        <option value="">Select a plan…</option>
                        {ptPlans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} — {plan.duration_months} month{plan.duration_months !== 1 ? 's' : ''} (₹{plan.fee})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Start Date" required={addPt}>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <input
                          type="date"
                          value={ptStartDate}
                          onChange={(e) => setPtStartDate(e.target.value)}
                          required={addPt}
                          className={`${inputCls} pl-9`}
                        />
                      </div>
                    </Field>
                    <Field label="Amount (₹)" required={addPt}>
                      <input
                        type="number"
                        value={ptAmount}
                        onChange={(e) => setPtAmount(e.target.value)}
                        required={addPt}
                        min={0}
                        step={0.01}
                        placeholder="0"
                        className={inputCls}
                      />
                    </Field>
                  </div>

                  {(() => {
                    const plan = ptPlans.find((p) => p.id === selectedPtPlanId)
                    if (!plan || parseFloat(ptAmount || '0') === plan.fee) return null
                    return (
                      <Field label={`Reason — amount differs from plan price (₹${plan.fee})`} required={addPt}>
                        <input
                          type="text"
                          value={ptAmountNote}
                          onChange={(e) => setPtAmountNote(e.target.value)}
                          required={addPt}
                          placeholder="e.g. discount applied"
                          className={inputCls}
                        />
                      </Field>
                    )
                  })()}

                  {selectedPtPlanId && ptPlans.length > 0 && (
                    <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2 border border-border">
                      {(() => {
                        const plan = ptPlans.find((p) => p.id === selectedPtPlanId)
                        if (!plan) return null
                        const expiry = new Date(getExpiryDateFromPlan(ptStartDate, plan.duration_months))
                        return (
                          <>
                            Expiry:{' '}
                            <span className="text-foreground font-medium">
                              {expiry.toLocaleDateString('en-GB')}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <Link
            href="/members"
            className="px-5 py-2.5 text-sm border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Add Member'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
