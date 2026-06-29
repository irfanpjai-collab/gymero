'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Landmark,
  DollarSign,
  TrendingDown,
  Scale,
  Loader2,
  Clock,
  ArrowRight,
  Receipt,
  CreditCard,
  Wallet,
  CheckCircle,
} from 'lucide-react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { getAccountsOverview, type AccountsOverview, type LedgerEntry } from '@/app/actions/accounts'
import { formatCurrency } from '@/lib/utils'

const LEDGER_TYPES = ['all', 'revenue', 'expense', 'salary'] as const
type LedgerFilter = typeof LEDGER_TYPES[number]

function StatCard({ label, value, icon: Icon, color, bg }: { label: string; value: string; icon: React.ElementType; color: string; bg: string }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4 stat-card">
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
        <p className="text-muted-foreground text-sm">{label}</p>
      </div>
    </div>
  )
}

function BreakdownPanel({ title, icon: Icon, items, total }: { title: string; icon: React.ElementType; items: { label: string; amount: number }[]; total: number }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-foreground font-semibold text-sm">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm py-4 text-center">No data yet</p>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const pct = total > 0 ? (item.amount / total) * 100 : 0
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground capitalize">{item.label}</span>
                  <span className="text-muted-foreground font-medium">{formatCurrency(item.amount)}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const LEDGER_TYPE_STYLES: Record<LedgerEntry['type'], { label: string; cls: string }> = {
  revenue: { label: 'Revenue', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  expense: { label: 'Expense', cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  salary:  { label: 'Salary',  cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
}

export default function AccountsClient() {
  const [data, setData] = useState<AccountsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all')

  useEffect(() => {
    getAccountsOverview().then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-32 gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading accounts overview…</span>
      </div>
    )
  }

  const filteredLedger = ledgerFilter === 'all' ? data.ledger : data.ledger.filter(l => l.type === ledgerFilter)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Landmark className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Accounts</h1>
          <p className="text-muted-foreground text-xs">Revenue, expenses, and salary — all linked in one place</p>
        </div>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="This Month Revenue" value={formatCurrency(data.thisMonthRevenue)} icon={DollarSign} color="text-emerald-400" bg="bg-emerald-500/10" />
        <StatCard label="This Month Outflow" value={formatCurrency(data.thisMonthExpenses + data.thisMonthSalary)} icon={TrendingDown} color="text-red-400" bg="bg-red-500/10" />
        <StatCard
          label="This Month Net"
          value={formatCurrency(data.thisMonthNet)}
          icon={Scale}
          color={data.thisMonthNet >= 0 ? 'text-emerald-400' : 'text-red-400'}
          bg={data.thisMonthNet >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}
        />
        <StatCard
          label="All-Time Net"
          value={formatCurrency(data.allTimeNet)}
          icon={Landmark}
          color={data.allTimeNet >= 0 ? 'text-emerald-400' : 'text-red-400'}
          bg={data.allTimeNet >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}
        />
      </div>

      {/* Pending summary */}
      {(data.pendingSalaryCount > 0 || data.pendingExpensesCount > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.pendingSalaryCount > 0 && (
            <Link href="/salary" className="bg-card rounded-2xl border border-amber-500/20 p-5 flex items-center justify-between hover:bg-amber-500/[0.03] transition-colors group">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(data.pendingSalaryTotal)}</p>
                  <p className="text-muted-foreground text-sm">{data.pendingSalaryCount} pending salary payout{data.pendingSalaryCount !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
          )}
          {data.pendingExpensesCount > 0 && (
            <Link href="/expenses" className="bg-card rounded-2xl border border-amber-500/20 p-5 flex items-center justify-between hover:bg-amber-500/[0.03] transition-colors group">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <Receipt className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(data.pendingExpensesTotal)}</p>
                  <p className="text-muted-foreground text-sm">{data.pendingExpensesCount} pending expense{data.pendingExpensesCount !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
          )}
        </div>
      )}

      {/* Trend chart */}
      <div className="bg-card rounded-2xl border border-border p-5 shadow-card">
        <h3 className="text-foreground font-semibold mb-4">Revenue vs Expenses vs Salary — Last 6 Months</h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data.monthlyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
            <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
              labelStyle={{ color: 'var(--foreground)' }}
              formatter={(value) => formatCurrency(Number(value))}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="revenue" name="Revenue" fill="#34d399" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses" fill="#f87171" radius={[6, 6, 0, 0]} />
            <Bar dataKey="salary" name="Salary" fill="#fbbf24" radius={[6, 6, 0, 0]} />
            <Line type="monotone" dataKey="net" name="Net" stroke="#5b7cfa" strokeWidth={2.5} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownPanel
          title="Expenses by Category"
          icon={Receipt}
          items={data.expensesByCategory}
          total={data.expensesByCategory.reduce((s, c) => s + c.amount, 0)}
        />
        <BreakdownPanel
          title="Payments by Method"
          icon={CreditCard}
          items={data.paymentsByMethod}
          total={data.paymentsByMethod.reduce((s, c) => s + c.amount, 0)}
        />
      </div>

      {/* Combined ledger */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground font-semibold text-sm">Transaction Ledger</span>
          </div>
          <div className="flex gap-1 bg-muted/30 border border-border rounded-xl p-1">
            {LEDGER_TYPES.map(t => (
              <button key={t} onClick={() => setLedgerFilter(t)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${ledgerFilter === t ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {filteredLedger.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <Wallet className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-muted-foreground text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Method</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.map(entry => {
                  const typeStyle = LEDGER_TYPE_STYLES[entry.type]
                  return (
                    <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                        {new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${typeStyle.cls}`}>{typeStyle.label}</span>
                      </td>
                      <td className="px-4 py-3 text-foreground font-medium capitalize">{entry.label}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{entry.method?.replace('_', ' ') ?? '—'}</td>
                      <td className="px-4 py-3">
                        {entry.status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle className="w-3 h-3" /> Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </td>
                      <td className={`px-5 py-3 text-right font-bold ${entry.type === 'revenue' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {entry.type === 'revenue' ? '+' : '−'}{formatCurrency(entry.amount)}
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
  )
}
