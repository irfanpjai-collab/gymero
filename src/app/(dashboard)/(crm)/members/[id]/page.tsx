import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Mail,
  MapPin,
  Calendar,
  FileText,
  Phone,
  User,
  Dumbbell,
  CreditCard,
  Clock,
  Edit,
  AlertCircle,
  Fingerprint,
  LogIn,
  LogOut,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react'
import { getMember } from '@/app/actions/members'
import { getPayments } from '@/app/actions/payments'
import { getMemberAdmsInfo } from '@/app/actions/adms'
import { formatDate, formatCurrency, getMembershipStatus, getStatusColor, getDaysUntilExpiry, getDaysSinceExpiry } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import RenewDialog from './renew-dialog'
import type { Payment } from '@/types'

const PUNCH_LABELS: Record<number, string> = {
  0: 'Check In',
  1: 'Check Out',
  4: 'OT In',
  5: 'OT Out',
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ renew?: string }>

// ─── Info row ────────────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm text-foreground mt-0.5 break-words">{value ?? '—'}</p>
      </div>
    </div>
  )
}

// ─── Payment method badge ────────────────────────────────────────────────────

function PaymentMethodBadge({ method }: { method: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    cash: { label: 'Cash', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    upi: { label: 'UPI', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    bank_transfer: {
      label: 'Bank Transfer',
      cls: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    },
  }
  const m = map[method] ?? { label: method, cls: 'text-muted-foreground bg-slate-500/10 border-slate-500/20' }
  return (
    <Badge className={`border text-xs ${m.cls}`}>{m.label}</Badge>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { id } = await params
  const { renew } = await searchParams

  const [member, payments, biometric] = await Promise.all([
    getMember(id),
    getPayments(id),
    getMemberAdmsInfo(id),
  ])

  if (!member) notFound()

  const membership = member.active_membership ?? null
  const membershipStatus = membership ? getMembershipStatus(membership.expiry_date) : null
  const daysLeft = membership ? getDaysUntilExpiry(membership.expiry_date) : null
  const statusColors = membershipStatus ? getStatusColor(membershipStatus) : getStatusColor('expired')
  const statusLabel =
    membershipStatus === 'active'
      ? 'Active'
      : membershipStatus === 'expiring_soon'
      ? 'Expiring Soon'
      : membershipStatus === 'grace_period'
      ? 'Grace Period'
      : 'Expired'

  const genderLabel =
    member.gender === 'male' ? 'Male' : member.gender === 'female' ? 'Female' : 'Other'

  let graceBanner = null
  if (membership && membershipStatus === 'grace_period') {
    const daysSince = getDaysSinceExpiry(membership.expiry_date)
    const daysLeftGrace = 180 - daysSince
    graceBanner = (
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex items-start gap-3">
        <Clock className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-foreground">Grace Period Active</h4>
          <p className="text-xs text-orange-300 mt-1">
            This member's membership expired on {formatDate(membership.expiry_date)} ({daysSince} days ago). 
            They are within the 180-day grace period and have <strong>{daysLeftGrace} days left</strong> to renew without paying the admission fee again.
          </p>
        </div>
      </div>
    )
  } else if (membership && membershipStatus === 'expired') {
    const daysSince = getDaysSinceExpiry(membership.expiry_date)
    graceBanner = (
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-foreground">Membership Lapsed</h4>
          <p className="text-xs text-red-300 mt-1">
            This member's membership expired on {formatDate(membership.expiry_date)} ({daysSince} days ago). 
            Since it has been more than 180 days, the grace period has expired. They must pay the <strong>admission fee</strong> to rejoin.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <Link
          href="/members"
          className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-card border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge className="border text-xs text-muted-foreground bg-slate-500/10 border-slate-500/20 font-mono">
              #{member.member_id}
            </Badge>
            {membership && (
              <Badge className={`border text-xs ${statusColors}`}>{statusLabel}</Badge>
            )}
            {!membership && (
              <Badge className="border text-xs text-muted-foreground bg-slate-500/10 border-slate-500/20">
                No Active Plan
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground truncate">{member.full_name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" />
            {member.mobile}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/members/${id}/edit`}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors"
          >
            <Edit className="w-3.5 h-3.5" />
            Edit
          </Link>
          <RenewDialog memberId={id} defaultOpen={renew === '1'} />
        </div>
      </div>

      {graceBanner}

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column — info */}
        <div className="lg:col-span-1 space-y-5">
          {/* Personal info */}
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">Personal Info</h2>
            </div>

            <InfoRow icon={Mail} label="Email" value={member.email || '—'} />
            <InfoRow icon={MapPin} label="Address" value={member.address || '—'} />
            <InfoRow icon={User} label="Gender" value={genderLabel} />
            <InfoRow icon={Calendar} label="Date Joined" value={formatDate(member.join_date)} />
            <InfoRow icon={CreditCard} label="Admission Fee Paid" value={member.admission_fee ? formatCurrency(member.admission_fee) : '—'} />
            {member.notes && (
              <InfoRow icon={FileText} label="Notes" value={member.notes} />
            )}
          </div>

          {/* Biometric status */}
          <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Fingerprint className="w-3.5 h-3.5 text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">Biometric</h2>
            </div>

            {biometric.enrolled ? (
              <Badge className="border text-xs text-green-400 bg-green-500/10 border-green-500/20 inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Fingerprint Enrolled
              </Badge>
            ) : (
              <Badge className="border text-xs text-muted-foreground bg-slate-500/10 border-slate-500/20 inline-flex items-center gap-1">
                <ShieldOff className="w-3 h-3" /> Not Enrolled
              </Badge>
            )}

            <p className="text-xs text-muted-foreground">
              {biometric.enrolled
                ? `${biometric.checkIns.length} check-in record${biometric.checkIns.length !== 1 ? 's' : ''} on device`
                : 'No fingerprint on file. Push this member to the device from the Biometric page.'}
            </p>

            <Link
              href="/biometric"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Fingerprint className="w-3.5 h-3.5" />
              Manage on Biometric page
            </Link>
          </div>
        </div>

        {/* Right column — membership + payments */}
        <div className="lg:col-span-2 space-y-5">
          {/* Active Membership */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Dumbbell className="w-3.5 h-3.5 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Active Membership</h2>
              </div>
              {membership && (
                <Badge className={`border text-xs ${statusColors}`}>{statusLabel}</Badge>
              )}
            </div>

            {!membership ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Dumbbell className="w-10 h-10 text-muted-foreground/60 mb-3" />
                <p className="text-muted-foreground text-sm font-medium">No active membership</p>
                <p className="text-muted-foreground/50 text-xs mt-1">
                  Add a membership plan to track this member&apos;s subscription.
                </p>
                <RenewDialog memberId={id} label="Add Membership" className="mt-4" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Start Date
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {formatDate(membership.start_date)}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Expiry Date
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {formatDate(membership.expiry_date)}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Amount Paid
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {formatCurrency(membership.amount)}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Days Left
                  </p>
                  <p
                    className={`text-sm font-bold ${
                      daysLeft !== null && daysLeft <= 0
                        ? 'text-red-400'
                        : daysLeft !== null && daysLeft <= 7
                        ? 'text-yellow-400'
                        : 'text-primary'
                    }`}
                  >
                    {daysLeft !== null
                      ? daysLeft <= 0
                        ? 'Expired'
                        : `${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
                      : '—'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Payment history */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <CreditCard className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">Payment History</h2>
              {payments.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {payments.length} record{payments.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                <CreditCard className="w-10 h-10 text-muted-foreground/60 mb-3" />
                <p className="text-muted-foreground text-sm font-medium">No payments recorded</p>
                <p className="text-muted-foreground/50 text-xs mt-1">
                  Payments will appear here once recorded.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                        Date
                      </th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                        Type
                      </th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                        Method
                      </th>
                      <th className="text-left px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                        Receipt #
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(payments as Payment[]).map((payment) => (
                      <tr key={payment.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                            {formatDate(payment.payment_date)}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-foreground">
                            {formatCurrency(payment.amount)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge className={`border text-xs ${
                            payment.payment_type === 'admission' 
                              ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' 
                              : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          }`}>
                            {payment.payment_type === 'admission' ? 'Admission' : 'Membership'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5">
                          <PaymentMethodBadge method={payment.payment_method} />
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">
                          {payment.receipt_number ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Check-in history */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Fingerprint className="w-3.5 h-3.5 text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">Check-In History</h2>
              {biometric.checkIns.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {biometric.checkIns.length} record{biometric.checkIns.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {biometric.checkIns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                <Fingerprint className="w-10 h-10 text-muted-foreground/60 mb-3" />
                <p className="text-muted-foreground text-sm font-medium">
                  {biometric.enrolled ? 'No check-ins recorded yet' : 'Not enrolled on the device'}
                </p>
                <p className="text-muted-foreground/50 text-xs mt-1">
                  Fingerprint punches will appear here once the member scans in.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                        Date
                      </th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                        Time
                      </th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {biometric.checkIns.map((c, i) => {
                      const isIn = c.punch === 0 || c.punch === 4
                      return (
                        <tr key={`${c.timestamp}-${i}`} className="hover:bg-muted/40 transition-colors">
                          <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                            {formatDate(c.timestamp)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                            {formatTime(c.timestamp)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              isIn ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'
                            }`}>
                              {isIn ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                              {PUNCH_LABELS[c.punch] ?? `Type ${c.punch}`}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
