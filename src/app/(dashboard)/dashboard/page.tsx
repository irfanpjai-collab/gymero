import Link from 'next/link'
import {
  Users,
  UserCheck,
  Clock,
  IndianRupee,
  AlertCircle,
  MessageCircle,
  Timer,
  TrendingUp,
  Ticket,
  RefreshCw,
} from 'lucide-react'
import { getDashboardStats, getGracePeriodMembers, getExpiringMembers } from '@/app/actions/dashboard'
import { getMembers } from '@/app/actions/members'
import WelcomeBanner from '@/components/dashboard/WelcomeBanner'
import { formatDate, formatCurrency } from '@/lib/utils'

function StatCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  trend,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  iconBg: string
  iconColor: string
  trend?: string
}) {
  return (
    <div className="stat-card bg-card rounded-2xl border border-border p-5 flex items-start gap-4">
      <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-extrabold text-foreground leading-none mb-1 tracking-tight">{value}</p>
        <p className="text-muted-foreground text-sm truncate">{label}</p>
        {trend && (
          <div className="flex items-center gap-1 mt-1.5">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">{trend}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  const [stats, gracePeriodMembers, expiringMembers, allMembers] = await Promise.all([
    getDashboardStats(),
    getGracePeriodMembers(8),
    getExpiringMembers(7),
    getMembers(),
  ])

  const today = new Date()
  const dateStr = today.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const statCards = [
    {
      label: 'Total Members',
      value: stats.totalMembers,
      icon: Users,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-400',
    },
    {
      label: 'Active Members',
      value: stats.activeMembers,
      icon: UserCheck,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'Expiring Soon',
      value: stats.expiringThisWeek,
      icon: Clock,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
    },
    {
      label: 'Grace Period',
      value: stats.gracePeriodMembers,
      icon: Timer,
      iconBg: 'bg-orange-500/10',
      iconColor: 'text-orange-400',
    },
    {
      label: 'Revenue This Month',
      value: formatCurrency(stats.revenueThisMonth),
      icon: IndianRupee,
      iconBg: 'bg-indigo-500/10',
      iconColor: 'text-indigo-400',
    },
    {
      label: 'Admission Fees',
      value: formatCurrency(stats.admissionFeeThisMonth),
      icon: Ticket,
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-400',
    },
    {
      label: 'Due Today',
      value: stats.dueToday,
      icon: AlertCircle,
      iconBg: 'bg-red-500/10',
      iconColor: 'text-red-400',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{dateStr}</p>
      </div>

      {/* Interactive Welcome Banner */}
      <WelcomeBanner members={allMembers} />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 stagger-children">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Two-column section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Expiring Soon Table */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in-up card-hover">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground text-sm">Expiring Soon</h2>
                <p className="text-muted-foreground text-[11px]">Next 7 days</p>
              </div>
              {expiringMembers.length > 0 && (
                <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5 font-medium">
                  {expiringMembers.length}
                </span>
              )}
            </div>
            <Link
              href="/members?status=expiring"
              className="text-xs text-primary hover:text-primary/70 transition-colors font-medium"
            >
              View all →
            </Link>
          </div>

          {expiringMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Clock className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm font-medium">No expiring members</p>
              <p className="text-muted-foreground/60 text-xs mt-1">Members expiring in the next 7 days will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Member</th>
                    <th className="text-left px-3 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Expiry</th>
                    <th className="text-left px-3 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Days</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {expiringMembers.map((member) => (
                    <tr key={member.id} className="table-row-hover">
                      <td className="px-5 py-3">
                        <Link href={`/members/${member.id}`} className="hover:text-primary transition-colors">
                          <p className="font-medium text-foreground leading-none">{member.full_name}</p>
                          <p className="text-muted-foreground/60 text-xs mt-0.5">#{member.member_id}</p>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(member.expiry_date)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={
                            member.days_left <= 0
                              ? 'text-red-400 font-semibold'
                              : member.days_left <= 3
                              ? 'text-orange-400 font-semibold'
                              : 'text-amber-400 font-semibold'
                          }
                        >
                          {member.days_left <= 0 ? 'Today' : `${member.days_left}d`}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/whatsapp?member=${member.id}`}
                          className="inline-flex items-center gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
                        >
                          <MessageCircle className="w-3 h-3" />
                          Remind
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Grace Period Members */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in-up card-hover" style={{ animationDelay: '100ms' }}>
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Timer className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground text-sm">Grace Period</h2>
                <p className="text-muted-foreground text-[11px]">Expired within 180 days</p>
              </div>
              {gracePeriodMembers.length > 0 && (
                <span className="text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full px-2 py-0.5 font-medium">
                  {gracePeriodMembers.length}
                </span>
              )}
            </div>
            <Link
              href="/members?status=grace"
              className="text-xs text-primary hover:text-primary/70 transition-colors font-medium"
            >
              View all →
            </Link>
          </div>

          {gracePeriodMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Timer className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm font-medium">No grace period members</p>
              <p className="text-muted-foreground/60 text-xs mt-1">Members expired within 180 days will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {gracePeriodMembers.map((member) => {
                const graceDaysLeft = 180 - member.days_since_expiry
                const urgency = graceDaysLeft <= 30
                  ? 'text-red-400'
                  : graceDaysLeft <= 90
                  ? 'text-orange-400'
                  : 'text-amber-400'

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between px-5 py-3 table-row-hover"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-orange-500/10 border border-orange-500/15 flex items-center justify-center flex-shrink-0">
                        <span className="text-orange-400 text-xs font-bold">
                          {member.full_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/members/${member.id}`}
                          className="text-foreground text-sm font-medium hover:text-primary transition-colors truncate block"
                        >
                          {member.full_name}
                        </Link>
                        <p className="text-muted-foreground/60 text-xs">
                          Expired {member.days_since_expiry}d ago · <span className={urgency}>{graceDaysLeft}d left</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <Link
                        href={`/members/${member.id}?renew=1`}
                        className="inline-flex items-center gap-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Renew
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
