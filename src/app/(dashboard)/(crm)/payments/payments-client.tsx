'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  CreditCard,
  Plus,
  X,
  Loader2,
  IndianRupee,
  Receipt,
  Calendar,
  Search,
  FileText,
  ChevronDown,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { getPayments, getMonthlyRevenue, getPaymentsSummary, recordPayment } from '@/app/actions/payments'
import { getMembers } from '@/app/actions/members'
import { getPlans, renewMembership, getLastMembershipExpiry } from '@/app/actions/memberships'
import { getGracePeriodDays } from '@/app/actions/settings'
import { sendReceiptViaWhatsApp } from '@/lib/receipt'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import SendReceiptButton from '@/components/shared/SendReceiptButton'
import type { Payment, Member, MembershipPlan } from '@/types'
import { differenceInDays, parseISO, addDays, format } from 'date-fns'

const inputCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors'

const selectCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground transition-colors'

function MethodBadge({ method }: { method: string }) {
  if (method === 'cash')
    return <Badge variant="success" className="capitalize">Cash</Badge>
  if (method === 'upi')
    return <Badge variant="info" className="capitalize">UPI</Badge>
  if (method === 'bank_transfer')
    return <Badge variant="purple">Bank Transfer</Badge>
  return <Badge variant="secondary" className="capitalize">{method}</Badge>
}

function TypeBadge({ type }: { type?: string }) {
  if (type === 'admission') return <Badge variant="info" className="capitalize">Admission</Badge>
  if (type === 'personal_training') return <Badge variant="purple">Personal Training</Badge>
  return <Badge variant="success" className="capitalize">Membership</Badge>
}

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

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground">{value}</p>
      </div>
    </div>
  )
}

const today = new Date().toISOString().slice(0, 10)

function RecordPaymentDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [members, setMembers] = useState<Member[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [amount, setAmount] = useState('')
  const [amountNote, setAmountNote] = useState('')
  const [method, setMethod] = useState('cash')
  const [type, setType] = useState('membership')
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  // Membership-renewal fields — only relevant when type === 'membership'.
  // A payment for a membership fee isn't a standalone transaction, it's a
  // renewal: it must pick a plan and go through the same expiry-extension
  // logic as the Renew dialog on the member's own page, or the payment gets
  // recorded with no effect on the member's actual expiry date at all.
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [admissionFee, setAdmissionFee] = useState('0')
  const [needsAdmissionFee, setNeedsAdmissionFee] = useState(false)
  const [lastExpiryDate, setLastExpiryDate] = useState<string | null>(null)
  const [daysSince, setDaysSince] = useState<number | null>(null)
  const [gracePeriodDays, setGracePeriodDays] = useState(180)

  useEffect(() => {
    if (open) {
      getMembers().then(setMembers)
      getPlans().then(setPlans)
      getGracePeriodDays().then(setGracePeriodDays)
    }
  }, [open])

  const filtered = memberSearch.length >= 1
    ? members.filter(
        (m) =>
          m.full_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
          m.mobile.includes(memberSearch) ||
          String(m.member_id).includes(memberSearch)
      ).slice(0, 8)
    : []

  async function handleSelectMember(m: Member) {
    setSelectedMember(m)
    setMemberSearch(m.full_name)
    setShowDropdown(false)

    // Same admission-fee/start-date logic as RenewDialog's loadOnOpen — only
    // meaningful for a membership-fee payment, but cheap enough to always load.
    const expiry = await getLastMembershipExpiry(m.id)
    setLastExpiryDate(expiry)
    if (!expiry) {
      setNeedsAdmissionFee(true)
      setDate(today)
    } else {
      const expiryDateObj = parseISO(expiry)
      const days = differenceInDays(new Date(), expiryDateObj)
      setDaysSince(days)
      setNeedsAdmissionFee(days > gracePeriodDays)
      setDate(days < 0 ? format(addDays(expiryDateObj, 1), 'yyyy-MM-dd') : today)
    }
  }

  function handlePlanChange(planId: string) {
    setSelectedPlanId(planId)
    const plan = plans.find((p) => p.id === planId)
    if (plan) setAmount(String(plan.fee))
  }

  function resetForm() {
    setMemberSearch('')
    setSelectedMember(null)
    setAmount('')
    setAmountNote('')
    setMethod('cash')
    setType('membership')
    setDate(today)
    setNotes('')
    setSelectedPlanId('')
    setAdmissionFee('0')
    setNeedsAdmissionFee(false)
    setLastExpiryDate(null)
    setDaysSince(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedMember) { setError('Please select a member'); return }
    if (type === 'membership' && !selectedPlanId) { setError('Please select a membership plan'); return }
    setError('')

    startTransition(async () => {
      const memberId = selectedMember.id

      if (type === 'membership') {
        const result = await renewMembership(memberId, {
          plan_id: selectedPlanId,
          start_date: date,
          amount: parseFloat(amount) || 0,
          amount_note: amountNote.trim() || undefined,
          admission_fee: parseFloat(admissionFee) || 0,
          payment_method: method,
        })
        if (result.error) { setError(result.error); return }
      } else {
        const result = await recordPayment({
          member_id: memberId,
          amount: parseFloat(amount),
          payment_method: method,
          payment_type: type,
          payment_date: date,
          notes: notes || undefined,
        })
        if (result.error) { setError(result.error); return }
      }

      resetForm()
      onSuccess()
      onClose()

      // Same "offer to send the receipt right away" as RenewDialog — fetch
      // the payment just recorded (freshest first) rather than threading it
      // through two different return shapes above.
      const payments = await getPayments(memberId)
      const latestPayment = payments[0]
      if (latestPayment?.member?.mobile) {
        toast.success('Payment recorded!', {
          action: { label: 'Send Receipt', onClick: () => sendReceiptViaWhatsApp(latestPayment) },
        })
      } else {
        toast.success('Payment recorded!')
      }
    })
  }

  if (!open) return null

  const selectedPlan = plans.find((p) => p.id === selectedPlanId)
  const expiryPreview = type === 'membership' && selectedPlan
    ? (() => {
        const d = new Date(date)
        d.setMonth(d.getMonth() + selectedPlan.duration_months)
        return d.toLocaleDateString('en-GB')
      })()
    : null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6">
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold text-foreground mb-5">Record Payment</h2>
        {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Member" required>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name or mobile..."
                value={memberSearch}
                onChange={(e) => { setMemberSearch(e.target.value); setShowDropdown(true); setSelectedMember(null) }}
                onFocus={() => setShowDropdown(true)}
                className={`${inputCls} pl-9`}
                required
              />
              {showDropdown && filtered.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-card border border-border rounded-xl overflow-hidden shadow-lg">
                  {filtered.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={() => handleSelectMember(m)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors"
                    >
                      <span className="text-foreground text-sm font-medium">{m.full_name}</span>
                      <span className="text-muted-foreground text-xs ml-2">#{m.member_id} · {m.mobile}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" required>
              <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
                <option value="membership">Membership Fee</option>
                <option value="admission">Admission Fee</option>
              </select>
            </Field>
            <Field label="Date" required>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
            </Field>
          </div>

          {type === 'membership' && (
            <>
              {needsAdmissionFee && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">
                    {lastExpiryDate ? (
                      <>Membership expired on {new Date(lastExpiryDate).toLocaleDateString('en-GB')} ({daysSince} days ago) — beyond the {gracePeriodDays}-day grace period. An admission fee is required.</>
                    ) : (
                      <>New member rejoining or has no membership history — an admission fee is required.</>
                    )}
                  </p>
                </div>
              )}

              <Field label="Membership Plan" required>
                <div className="relative">
                  <select value={selectedPlanId} onChange={(e) => handlePlanChange(e.target.value)} required className={selectCls}>
                    <option value="">Select a plan…</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} — {plan.duration_months} month{plan.duration_months !== 1 ? 's' : ''} (₹{plan.fee})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)" required>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls}
                required
              />
            </Field>
            <Field label="Method" required>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectCls}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </Field>
          </div>

          {type === 'membership' && selectedPlan && parseFloat(amount || '0') !== selectedPlan.fee && (
            <Field label={`Reason — amount differs from plan price (₹${selectedPlan.fee})`} required>
              <input
                type="text"
                value={amountNote}
                onChange={(e) => setAmountNote(e.target.value)}
                required
                placeholder="e.g. loyalty discount, partial payment"
                className={inputCls}
              />
            </Field>
          )}

          {type === 'membership' && (
            <Field label={needsAdmissionFee ? 'Admission Fee (₹) — Required' : 'Admission Fee (₹) — Waived (within grace period)'}>
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
          )}

          {expiryPreview && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2 border border-border">
              New expiry: <span className="text-foreground font-medium">{expiryPreview}</span>
            </div>
          )}

          {type === 'admission' && (
            <Field label="Notes">
              <textarea
                rows={2}
                placeholder="Optional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputCls} resize-none`}
              />
            </Field>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl text-sm transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

const METHOD_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Cash', value: 'cash' },
  { label: 'UPI', value: 'upi' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
]

export default function PaymentsClient({
  initialPayments,
  initialMonthlyRevenue,
  initialSummary,
}: {
  initialPayments: Payment[]
  initialMonthlyRevenue: { month: string; revenue: number }[]
  initialSummary: { totalRevenue: number; totalCount: number }
}) {
  const [payments, setPayments] = useState<Payment[]>(initialPayments)
  const [monthlyRevenue, setMonthlyRevenue] = useState<{ month: string; revenue: number }[]>(initialMonthlyRevenue)
  const [summary, setSummary] = useState(initialSummary)
  const [loading, setLoading] = useState(false)
  const [methodFilter, setMethodFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  async function load() {
    setLoading(true)
    const [p, mr, s] = await Promise.all([getPayments(), getMonthlyRevenue(), getPaymentsSummary()])
    setPayments(p)
    setMonthlyRevenue(mr)
    setSummary(s)
    setLoading(false)
  }

  const today = new Date().toISOString().slice(0, 10)
  // Today's payments are always within the most recent 100 rows in practice,
  // so deriving this from the (capped) list is safe — but total/all-time
  // figures below must come from the unlimited summary query instead.
  const todayRevenue = payments.filter((p) => p.payment_date === today).reduce((s, p) => s + p.amount, 0)
  const thisMonth = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const monthRevenue = monthlyRevenue.find((m) => m.month === thisMonth)?.revenue ?? 0
  const totalRevenue = summary.totalRevenue

  const filtered = methodFilter ? payments.filter((p) => p.payment_method === methodFilter) : payments

  return (
    <div className="space-y-5">
      <RecordPaymentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSuccess={load} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Payments</h1>
            <p className="text-muted-foreground text-xs">{summary.totalCount} total records</p>
          </div>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Record Payment
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Today's Revenue" value={formatCurrency(todayRevenue)} icon={IndianRupee} color="bg-primary/10 text-primary" />
        <StatCard label="This Month's Revenue" value={formatCurrency(monthRevenue)} icon={Calendar} color="bg-blue-500/10 text-blue-400" />
        <StatCard label="Total Collected" value={formatCurrency(totalRevenue)} icon={Receipt} color="bg-purple-500/10 text-purple-400" />
      </div>

      {/* Method filter */}
      <div className="flex gap-2 flex-wrap">
        {METHOD_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setMethodFilter(f.value)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${
              methodFilter === f.value
                ? 'bg-primary text-white'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
            <p className="text-muted-foreground text-sm mt-3">Loading payments…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-foreground font-semibold">No payments found</p>
            <p className="text-muted-foreground text-sm mt-1">
              {methodFilter ? `No ${methodFilter.replace('_', ' ')} payments yet.` : 'Record your first payment using the button above.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Date', 'Member', 'Type', 'Plan', 'Amount', 'Method', 'Receipt #', '', ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-3">
                      <div>
                        {p.member?.full_name ? (
                          <Link href={`/members/${p.member_id}`} className="text-foreground font-medium hover:text-primary hover:underline transition-colors">
                            {p.member.full_name}
                          </Link>
                        ) : (
                          <p className="text-foreground font-medium">—</p>
                        )}
                        <p className="text-xs text-muted-foreground">#{p.member?.member_id}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3"><TypeBadge type={p.payment_type} /></td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {p.membership?.plan
                        ? `${p.membership.plan.name} (${p.membership.plan.duration_months}mo)`
                        : p.pt_membership?.plan
                        ? `${p.pt_membership.plan.name} (${p.pt_membership.plan.duration_months}mo)`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3"><MethodBadge method={p.payment_method} /></td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.receipt_number ?? '—'}</td>
                    <td className="px-4 py-3">
                      {p.notes && (
                        <span className="text-xs text-muted-foreground" title={p.notes}>
                          {p.notes.slice(0, 30)}{p.notes.length > 30 ? '…' : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3"><SendReceiptButton payment={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
