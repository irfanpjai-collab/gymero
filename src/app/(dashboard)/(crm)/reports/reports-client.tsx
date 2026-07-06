'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BarChart3, Download, Users, DollarSign, TrendingUp, TrendingDown, Scale } from 'lucide-react'
import * as XLSX from 'xlsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatDate, formatCurrency, getMembershipStatus } from '@/lib/utils'
import type { Member, Payment } from '@/types'

const TABS = ['Members', 'Financial'] as const
type TabType = typeof TABS[number]

function exportToExcel(data: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export default function ReportsClient({
  initialMembers,
  initialPayments,
  initialTotalSalaryPaid,
  initialTotalExpensesPaid,
  initialMonthlyRevenue,
  gracePeriodDays,
}: {
  initialMembers: Member[]
  initialPayments: Payment[]
  initialTotalSalaryPaid: number
  initialTotalExpensesPaid: number
  initialMonthlyRevenue: { month: string; revenue: number }[]
  gracePeriodDays: number
}) {
  const [tab, setTab] = useState<TabType>('Members')
  const members = initialMembers
  const payments = initialPayments
  const totalSalaryPaid = initialTotalSalaryPaid
  const totalExpensesPaid = initialTotalExpensesPaid
  const monthlyRevenue = initialMonthlyRevenue

  const active = members.filter(m => m.active_membership && getMembershipStatus(m.active_membership.expiry_date, gracePeriodDays) === 'active')
  const expired = members.filter(m => !m.active_membership || getMembershipStatus(m.active_membership.expiry_date, gracePeriodDays) === 'expired')
  const expiringSoon = members.filter(m => m.active_membership && getMembershipStatus(m.active_membership.expiry_date, gracePeriodDays) === 'expiring_soon')
  const totalRevenue = payments.reduce((s, p) => s + p.amount, 0)
  const netProfit = totalRevenue - totalSalaryPaid - totalExpensesPaid

  function exportMembers() {
    exportToExcel(members.map(m => ({
      'Member ID': m.member_id,
      'Name': m.full_name,
      'Mobile': m.mobile,
      'Email': m.email ?? '',
      'Gender': m.gender,
      'Join Date': m.join_date ? formatDate(m.join_date) : '',
      'Expiry Date': m.active_membership ? formatDate(m.active_membership.expiry_date) : 'N/A',
      'Status': m.active_membership ? getMembershipStatus(m.active_membership.expiry_date, gracePeriodDays) : 'No Plan',
    })), 'members-report')
  }

  function exportPayments() {
    exportToExcel(payments.map(p => ({
      'Date': formatDate(p.payment_date),
      'Receipt': p.receipt_number ?? '',
      'Amount': p.amount,
      'Method': p.payment_method,
      'Notes': p.notes ?? '',
    })), 'payments-report')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Analytics and data exports</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Members Tab */}
      {tab === 'Members' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total', value: members.length, color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { label: 'Active', value: active.length, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { label: 'Expiring Soon', value: expiringSoon.length, color: 'text-amber-400', bg: 'bg-amber-500/10' },
              { label: 'Expired', value: expired.length, color: 'text-red-400', bg: 'bg-red-500/10' },
            ].map(s => (
              <div key={s.label} className="bg-card rounded-2xl border border-border p-5 stat-card">
                <div className={`inline-flex w-10 h-10 rounded-xl ${s.bg} items-center justify-center mb-3`}>
                  <Users className={`w-5 h-5 ${s.color}`} />
                </div>
                <p className={`text-3xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-muted-foreground text-sm mt-1">{s.label} Members</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={exportMembers}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-colors shadow-md shadow-primary/20">
              <Download className="w-4 h-4" /> Export Excel
            </button>
          </div>
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground font-semibold text-sm">All Members</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {['ID', 'Name', 'Mobile', 'Join Date', 'Expiry', 'Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.slice(0, 50).map(m => {
                    const status = m.active_membership ? getMembershipStatus(m.active_membership.expiry_date, gracePeriodDays) : 'no_plan'
                    const statusColors: Record<string, string> = {
                      active: 'text-emerald-400',
                      expiring_soon: 'text-amber-400',
                      grace_period: 'text-orange-400',
                      expired: 'text-red-400',
                      no_plan: 'text-muted-foreground'
                    }
                    return (
                      <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">#{m.member_id}</td>
                        <td className="px-4 py-2.5 text-foreground font-medium">
                          <Link href={`/members/${m.id}`} className="hover:text-primary hover:underline transition-colors">
                            {m.full_name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{m.mobile}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{m.join_date ? formatDate(m.join_date) : '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{m.active_membership ? formatDate(m.active_membership.expiry_date) : '—'}</td>
                        <td className="px-4 py-2.5"><span className={`capitalize text-sm font-medium ${statusColors[status] ?? 'text-muted-foreground'}`}>{status.replace(/_/g, ' ')}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Financial Tab */}
      {tab === 'Financial' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { label: 'Total Revenue', value: formatCurrency(totalRevenue), icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { label: 'Total Payments', value: payments.length, icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { label: 'Avg Payment', value: payments.length ? formatCurrency(totalRevenue / payments.length) : '₹0', icon: BarChart3, color: 'text-purple-400', bg: 'bg-purple-500/10' },
            ].map(s => (
              <div key={s.label} className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4 stat-card">
                <div className={`w-11 h-11 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-foreground">{s.value}</p>
                  <p className="text-muted-foreground text-sm">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Net position — links revenue against salary + expenses, all paid-to-date */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { label: 'Salary Paid (All Time)', value: formatCurrency(totalSalaryPaid), icon: TrendingDown, color: 'text-amber-400', bg: 'bg-amber-500/10' },
              { label: 'Expenses Paid (All Time)', value: formatCurrency(totalExpensesPaid), icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10' },
              { label: 'Net (Revenue − Salary − Expenses)', value: formatCurrency(netProfit), icon: Scale, color: netProfit >= 0 ? 'text-emerald-400' : 'text-red-400', bg: netProfit >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10' },
            ].map(s => (
              <div key={s.label} className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4 stat-card">
                <div className={`w-11 h-11 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                  <p className="text-muted-foreground text-sm">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
          {monthlyRevenue.length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-5 shadow-card">
              <h3 className="text-foreground font-semibold mb-4">Monthly Revenue</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyRevenue}>
                  <XAxis dataKey="month" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                    labelStyle={{ color: 'var(--foreground)' }}
                    itemStyle={{ color: '#5b7cfa' }}
                  />
                  <Bar dataKey="revenue" fill="#5b7cfa" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={exportPayments}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-colors shadow-md shadow-primary/20">
              <Download className="w-4 h-4" /> Export Excel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
