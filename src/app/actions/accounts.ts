'use server'

import { createClient } from '@/lib/supabase/server'

export interface MonthlyTrendPoint {
  month: string // e.g. "Jun 2026"
  revenue: number
  expenses: number
  salary: number
  net: number
}

export interface CategoryTotal {
  label: string
  amount: number
}

export interface LedgerEntry {
  id: string
  date: string
  type: 'revenue' | 'expense' | 'salary'
  label: string
  amount: number
  method: string | null
  status: 'paid' | 'pending'
}

export interface AccountsOverview {
  thisMonthRevenue: number
  thisMonthExpenses: number
  thisMonthSalary: number
  thisMonthNet: number
  allTimeNet: number
  pendingSalaryTotal: number
  pendingSalaryCount: number
  pendingExpensesTotal: number
  pendingExpensesCount: number
  monthlyTrend: MonthlyTrendPoint[]
  expensesByCategory: CategoryTotal[]
  paymentsByMethod: CategoryTotal[]
  ledger: LedgerEntry[]
}

const EMPTY: AccountsOverview = {
  thisMonthRevenue: 0, thisMonthExpenses: 0, thisMonthSalary: 0, thisMonthNet: 0, allTimeNet: 0,
  pendingSalaryTotal: 0, pendingSalaryCount: 0, pendingExpensesTotal: 0, pendingExpensesCount: 0,
  monthlyTrend: [], expensesByCategory: [], paymentsByMethod: [], ledger: [],
}

function monthKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

// One round trip for the whole Accounts page instead of N separate server
// actions — same lesson as the Biometric page consolidation: each client-side
// server action call pays its own connection overhead, which dominates at
// this data scale far more than the queries themselves.
//
// Admin-only is enforced by the page itself (a server component checking the
// caller's role before rendering this), same as how RLS already makes
// staff_salaries/expenses invisible to non-admins regardless.
export async function getAccountsOverview(): Promise<AccountsOverview> {
  try {
    const supabase = await createClient()

    const [
      { data: paymentsLite },
      { data: paymentsLedger },
      { data: expenses },
      { data: salaries },
    ] = await Promise.all([
      supabase.from('payments').select('amount, payment_method, payment_date'),
      supabase
        .from('payments')
        .select('id, amount, payment_method, payment_type, payment_date, member:members!payments_member_id_fkey(full_name)')
        .order('payment_date', { ascending: false })
        .limit(300),
      supabase.from('expenses').select('*'),
      supabase.from('staff_salaries').select('*'),
    ])

    const today = new Date()
    const thisMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

    type PaymentLite = { amount: number; payment_method: string; payment_date: string }
    const payments = (paymentsLite ?? []) as PaymentLite[]

    type ExpenseRow = { id: string; category: string; description: string; amount: number; expense_date: string; payment_method: string; status: 'pending' | 'paid' }
    const expenseRows = (expenses ?? []) as ExpenseRow[]

    type SalaryRow = { id: string; staff_name: string; net_salary: number; month: string; status: 'pending' | 'paid' }
    const salaryRows = (salaries ?? []) as SalaryRow[]

    // ── This month / all time ──
    const thisMonthRevenue = payments.filter(p => monthKey(p.payment_date) === thisMonthKey).reduce((s, p) => s + p.amount, 0)
    const thisMonthExpenses = expenseRows.filter(e => e.status === 'paid' && monthKey(e.expense_date) === thisMonthKey).reduce((s, e) => s + e.amount, 0)
    const thisMonthSalary = salaryRows.filter(s => s.status === 'paid' && s.month.slice(0, 7) === thisMonthKey).reduce((s, sal) => s + sal.net_salary, 0)

    const allTimeRevenue = payments.reduce((s, p) => s + p.amount, 0)
    const allTimeExpenses = expenseRows.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount, 0)
    const allTimeSalary = salaryRows.filter(s => s.status === 'paid').reduce((s, sal) => s + sal.net_salary, 0)

    // ── Pending ──
    const pendingSalaries = salaryRows.filter(s => s.status === 'pending')
    const pendingExpenses = expenseRows.filter(e => e.status === 'pending')

    // ── Monthly trend, last 6 months ──
    const monthKeys: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const monthlyTrend: MonthlyTrendPoint[] = monthKeys.map(key => {
      const revenue = payments.filter(p => monthKey(p.payment_date) === key).reduce((s, p) => s + p.amount, 0)
      const exp = expenseRows.filter(e => e.status === 'paid' && monthKey(e.expense_date) === key).reduce((s, e) => s + e.amount, 0)
      const sal = salaryRows.filter(s => s.status === 'paid' && s.month.slice(0, 7) === key).reduce((s, sa) => s + sa.net_salary, 0)
      return { month: monthLabel(key), revenue, expenses: exp, salary: sal, net: revenue - exp - sal }
    })

    // ── Breakdowns ──
    const expenseCategoryMap: Record<string, number> = {}
    for (const e of expenseRows) {
      expenseCategoryMap[e.category] = (expenseCategoryMap[e.category] ?? 0) + e.amount
    }
    const expensesByCategory = Object.entries(expenseCategoryMap)
      .map(([label, amount]) => ({ label: label.replace(/_/g, ' '), amount }))
      .sort((a, b) => b.amount - a.amount)

    const methodMap: Record<string, number> = {}
    for (const p of payments) {
      methodMap[p.payment_method] = (methodMap[p.payment_method] ?? 0) + p.amount
    }
    const paymentsByMethod = Object.entries(methodMap)
      .map(([label, amount]) => ({ label: label.replace('_', ' '), amount }))
      .sort((a, b) => b.amount - a.amount)

    // ── Combined ledger ──
    type PaymentLedgerRow = { id: string; amount: number; payment_method: string; payment_type: string; payment_date: string; member: { full_name: string } | { full_name: string }[] | null }
    const ledgerPayments: LedgerEntry[] = ((paymentsLedger ?? []) as unknown as PaymentLedgerRow[]).map(p => {
      const member = Array.isArray(p.member) ? p.member[0] : p.member
      return {
        id: `payment-${p.id}`,
        date: p.payment_date,
        type: 'revenue' as const,
        label: `${p.payment_type === 'admission' ? 'Admission fee' : 'Membership payment'} — ${member?.full_name ?? 'Unknown member'}`,
        amount: p.amount,
        method: p.payment_method,
        status: 'paid' as const,
      }
    })
    const ledgerExpenses: LedgerEntry[] = expenseRows.map(e => ({
      id: `expense-${e.id}`,
      date: e.expense_date,
      type: 'expense' as const,
      label: `${e.category.replace(/_/g, ' ')} — ${e.description}`,
      amount: e.amount,
      method: e.payment_method,
      status: e.status,
    }))
    const ledgerSalaries: LedgerEntry[] = salaryRows.map(s => ({
      id: `salary-${s.id}`,
      date: s.month,
      type: 'salary' as const,
      label: `Salary — ${s.staff_name}`,
      amount: s.net_salary,
      method: null,
      status: s.status,
    }))

    const ledger = [...ledgerPayments, ...ledgerExpenses, ...ledgerSalaries]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 200)

    return {
      thisMonthRevenue,
      thisMonthExpenses,
      thisMonthSalary,
      thisMonthNet: thisMonthRevenue - thisMonthExpenses - thisMonthSalary,
      allTimeNet: allTimeRevenue - allTimeExpenses - allTimeSalary,
      pendingSalaryTotal: pendingSalaries.reduce((s, sal) => s + sal.net_salary, 0),
      pendingSalaryCount: pendingSalaries.length,
      pendingExpensesTotal: pendingExpenses.reduce((s, e) => s + e.amount, 0),
      pendingExpensesCount: pendingExpenses.length,
      monthlyTrend,
      expensesByCategory,
      paymentsByMethod,
      ledger,
    }
  } catch (err) {
    console.error('getAccountsOverview error:', err)
    return EMPTY
  }
}
