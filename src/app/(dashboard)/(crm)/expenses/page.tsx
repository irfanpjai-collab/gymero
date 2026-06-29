'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Receipt,
  Plus,
  X,
  Loader2,
  CheckCircle,
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  DollarSign,
} from 'lucide-react'
import {
  getExpenses,
  createExpense,
  markExpensePaid,
  deleteExpense,
  type Expense,
  type ExpenseCategory,
} from '@/app/actions/expenses'
import { formatCurrency } from '@/lib/utils'

const EXPENSE_CATEGORIES = [
  'rent', 'electricity', 'water', 'maintenance',
  'equipment', 'supplies', 'marketing', 'staff_welfare', 'other',
] as const satisfies readonly ExpenseCategory[]

const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer'] as const
type PaymentMethod = typeof PAYMENT_METHODS[number]

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  rent: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  electricity: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  water: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  maintenance: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  equipment: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  supplies: 'text-lime-400 bg-lime-500/10 border-lime-500/20',
  marketing: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  staff_welfare: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  other: 'text-muted-foreground bg-muted border-border',
}

const inputCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-border-bright focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors'

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

function getMonthLabel(monthStr: string) {
  const [y, m] = monthStr.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

// ── Add Expense Dialog ──────────────────────────────────────────────────────
function AddExpenseDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [category, setCategory] = useState<ExpenseCategory>('other')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(getToday())
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { if (open) setExpenseDate(getToday()) }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!description.trim()) { setError('Description is required'); return }
    if (!amount || parseFloat(amount) <= 0) { setError('Amount must be greater than 0'); return }
    startTransition(async () => {
      const result = await createExpense({
        category,
        description: description.trim(),
        amount: parseFloat(amount),
        expense_date: expenseDate,
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
      })
      if (result.error) { setError(result.error); return }
      setCategory('other'); setDescription(''); setAmount(''); setPaymentMethod('cash'); setNotes('')
      onSuccess(); onClose()
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-elevated p-6 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 mb-5">
          <Receipt className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Add Expense</h2>
        </div>
        {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Date" required>
            <input type="date" max={getToday()} value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Category" required>
            <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)} className={inputCls}>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>
              ))}
            </select>
          </Field>
          <Field label="Description" required>
            <input type="text" placeholder="e.g. June electricity bill" value={description} onChange={e => setDescription(e.target.value)} className={inputCls} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount ₹" required>
              <input type="number" min={0} placeholder="2500" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} required />
            </Field>
            <Field label="Payment Method" required>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)} className={inputCls}>
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>{m === 'bank_transfer' ? 'Bank Transfer' : m.charAt(0).toUpperCase() + m.slice(1)}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <input type="text" placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border text-muted-foreground hover:text-foreground rounded-xl text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={isPending} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors">
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Expense Row ──────────────────────────────────────────────────────────────
function ExpenseRow({
  expense,
  onRefresh,
}: {
  expense: Expense
  onRefresh: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function handleMarkPaid() {
    startTransition(async () => {
      await markExpensePaid(expense.id)
      onRefresh()
    })
  }

  function handleDelete() {
    if (!confirm(`Delete expense "${expense.description}"?`)) return
    startTransition(async () => {
      await deleteExpense(expense.id)
      onRefresh()
    })
  }

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-5 py-4 text-muted-foreground text-sm">{new Date(expense.expense_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
      <td className="px-4 py-4">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${CATEGORY_COLORS[expense.category]}`}>
          {expense.category.replace(/_/g, ' ')}
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="font-medium text-foreground text-sm">{expense.description}</div>
        {expense.notes && <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[160px]">{expense.notes}</div>}
      </td>
      <td className="px-4 py-4 text-foreground font-bold text-sm">{formatCurrency(expense.amount)}</td>
      <td className="px-4 py-4 text-muted-foreground text-sm capitalize">{expense.payment_method.replace('_', ' ')}</td>
      <td className="px-4 py-4">
        {expense.status === 'paid' ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-medium">
            <CheckCircle className="w-3 h-3" /> Paid
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full font-medium">
            <Clock className="w-3 h-3" /> Pending
          </span>
        )}
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-2">
          {expense.status === 'pending' && (
            <button
              onClick={handleMarkPaid}
              disabled={isPending}
              className="inline-flex items-center gap-1 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
              Mark Paid
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'all'>('all')

  async function load() {
    setLoading(true)
    const data = await getExpenses(currentMonth)
    setExpenses(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [currentMonth])

  const filtered = categoryFilter === 'all' ? expenses : expenses.filter(e => e.category === categoryFilter)

  const totalPaid = filtered.filter(e => e.status === 'paid').reduce((a, e) => a + e.amount, 0)
  const totalPending = filtered.filter(e => e.status === 'pending').reduce((a, e) => a + e.amount, 0)
  const totalAmount = filtered.reduce((a, e) => a + e.amount, 0)

  function prevMonth() {
    const [y, m] = currentMonth.split('-').map(Number)
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    setCurrentMonth(prev)
  }

  function nextMonth() {
    const [y, m] = currentMonth.split('-').map(Number)
    const now = getCurrentMonth()
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    if (next <= now) setCurrentMonth(next)
  }

  const isCurrentMonth = currentMonth === getCurrentMonth()

  return (
    <div className="space-y-6">
      <AddExpenseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={load}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Expenses</h1>
            <p className="text-muted-foreground text-xs">Track daily operating costs by category</p>
          </div>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors shadow-md shadow-primary/20"
        >
          <Plus className="w-4 h-4" />
          Add Expense
        </button>
      </div>

      {/* Month Navigator + Category Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={prevMonth} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="px-5 py-2 bg-card border border-border rounded-xl min-w-[160px] text-center">
          <span className="text-foreground font-semibold text-sm">{getMonthLabel(currentMonth)}</span>
        </div>
        <button onClick={nextMonth} disabled={isCurrentMonth} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight className="w-4 h-4" />
        </button>

        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value as ExpenseCategory | 'all')}
          className="px-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground"
        >
          <option value="all">All categories</option>
          {EXPENSE_CATEGORIES.map(c => (
            <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Expenses', value: formatCurrency(totalAmount), icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Paid', value: formatCurrency(totalPaid), icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Pending', value: formatCurrency(totalPending), icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
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

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground font-semibold text-sm">
              {filtered.length} Record{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
          {filtered.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="text-emerald-400 font-medium">{filtered.filter(e => e.status === 'paid').length} paid</span>
              <span>·</span>
              <span className="text-amber-400 font-medium">{filtered.filter(e => e.status === 'pending').length} pending</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="w-6 h-6 text-primary animate-spin mb-3" />
            <p className="text-muted-foreground text-sm">Loading expenses…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <TrendingDown className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <p className="text-foreground font-semibold">No expenses</p>
            <p className="text-muted-foreground text-sm mt-1">Add expenses for {getMonthLabel(currentMonth)}.</p>
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Expense
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Amount</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Method</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <ExpenseRow key={e.id} expense={e} onRefresh={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
