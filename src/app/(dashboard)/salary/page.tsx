'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Wallet,
  Plus,
  X,
  Loader2,
  CheckCircle,
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Users,
  DollarSign,
} from 'lucide-react'
import { getSalaries, createSalary, markSalaryPaid, deleteSalary, type StaffSalary } from '@/app/actions/salary'
import { formatCurrency } from '@/lib/utils'

const STAFF_TYPES = ['coach', 'receptionist', 'admin', 'other'] as const
type StaffType = typeof STAFF_TYPES[number]

const STAFF_TYPE_COLORS: Record<StaffType, string> = {
  coach: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  receptionist: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  admin: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
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

// ── Add Salary Dialog ─────────────────────────────────────────────────────────
function AddSalaryDialog({
  open,
  onClose,
  onSuccess,
  currentMonth,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  currentMonth: string
}) {
  const [isPending, startTransition] = useTransition()
  const [staffName, setStaffName] = useState('')
  const [staffType, setStaffType] = useState<StaffType>('coach')
  const [month, setMonth] = useState(currentMonth)
  const [baseSalary, setBaseSalary] = useState('')
  const [bonus, setBonus] = useState('0')
  const [deductions, setDeductions] = useState('0')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { if (open) setMonth(currentMonth) }, [open, currentMonth])

  const net = (parseFloat(baseSalary) || 0) + (parseFloat(bonus) || 0) - (parseFloat(deductions) || 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!staffName.trim()) { setError('Staff name is required'); return }
    if (!baseSalary || parseFloat(baseSalary) <= 0) { setError('Base salary must be greater than 0'); return }
    startTransition(async () => {
      const result = await createSalary({
        staff_name: staffName.trim(),
        staff_type: staffType,
        month,
        base_salary: parseFloat(baseSalary),
        bonus: parseFloat(bonus) || 0,
        deductions: parseFloat(deductions) || 0,
        notes: notes.trim() || undefined,
      })
      if (result.error) { setError(result.error); return }
      setStaffName(''); setBaseSalary(''); setBonus('0'); setDeductions('0'); setNotes('')
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
          <Wallet className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Add Salary Record</h2>
        </div>
        {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Month" required>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Staff Name" required>
            <input type="text" placeholder="e.g. Arjun Sharma" value={staffName} onChange={e => setStaffName(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Role" required>
            <select value={staffType} onChange={e => setStaffType(e.target.value as StaffType)} className={inputCls}>
              {STAFF_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Base Salary ₹" required>
              <input type="number" min={0} placeholder="15000" value={baseSalary} onChange={e => setBaseSalary(e.target.value)} className={inputCls} required />
            </Field>
            <Field label="Bonus ₹">
              <input type="number" min={0} placeholder="0" value={bonus} onChange={e => setBonus(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Deductions ₹">
              <input type="number" min={0} placeholder="0" value={deductions} onChange={e => setDeductions(e.target.value)} className={inputCls} />
            </Field>
          </div>
          {/* Net preview */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
            <span className="text-sm text-muted-foreground">Net Salary</span>
            <span className="text-lg font-bold text-primary">{formatCurrency(Math.max(0, net))}</span>
          </div>
          <Field label="Notes">
            <input type="text" placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border text-muted-foreground hover:text-foreground rounded-xl text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={isPending} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors">
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Add Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Salary Row ────────────────────────────────────────────────────────────────
function SalaryRow({
  salary,
  onRefresh,
}: {
  salary: StaffSalary
  onRefresh: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function handleMarkPaid() {
    startTransition(async () => {
      await markSalaryPaid(salary.id)
      onRefresh()
    })
  }

  function handleDelete() {
    if (!confirm(`Delete salary record for ${salary.staff_name}?`)) return
    startTransition(async () => {
      await deleteSalary(salary.id)
      onRefresh()
    })
  }

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-5 py-4">
        <div>
          <div className="font-medium text-foreground text-sm">{salary.staff_name}</div>
          {salary.notes && <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[160px]">{salary.notes}</div>}
        </div>
      </td>
      <td className="px-4 py-4">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${STAFF_TYPE_COLORS[salary.staff_type]}`}>
          {salary.staff_type}
        </span>
      </td>
      <td className="px-4 py-4 text-muted-foreground text-sm">{formatCurrency(salary.base_salary)}</td>
      <td className="px-4 py-4">
        <span className={salary.bonus > 0 ? 'text-emerald-400 text-sm font-medium' : 'text-muted-foreground/40 text-sm'}>
          {salary.bonus > 0 ? `+${formatCurrency(salary.bonus)}` : '—'}
        </span>
      </td>
      <td className="px-4 py-4">
        <span className={salary.deductions > 0 ? 'text-red-400 text-sm font-medium' : 'text-muted-foreground/40 text-sm'}>
          {salary.deductions > 0 ? `-${formatCurrency(salary.deductions)}` : '—'}
        </span>
      </td>
      <td className="px-4 py-4">
        <span className="text-foreground font-bold text-sm">{formatCurrency(salary.net_salary)}</span>
      </td>
      <td className="px-4 py-4">
        {salary.status === 'paid' ? (
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
          {salary.status === 'pending' && (
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
export default function SalaryPage() {
  const [salaries, setSalaries] = useState<StaffSalary[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())

  async function load() {
    setLoading(true)
    const data = await getSalaries(currentMonth)
    setSalaries(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [currentMonth])

  const totalPaid = salaries.filter(s => s.status === 'paid').reduce((a, s) => a + s.net_salary, 0)
  const totalPending = salaries.filter(s => s.status === 'pending').reduce((a, s) => a + s.net_salary, 0)
  const totalNet = salaries.reduce((a, s) => a + s.net_salary, 0)

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
      <AddSalaryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={load}
        currentMonth={currentMonth}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Salary</h1>
            <p className="text-muted-foreground text-xs">Manage staff &amp; coach salaries</p>
          </div>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors shadow-md shadow-primary/20"
        >
          <Plus className="w-4 h-4" />
          Add Record
        </button>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="px-5 py-2 bg-card border border-border rounded-xl min-w-[160px] text-center">
          <span className="text-foreground font-semibold text-sm">{getMonthLabel(currentMonth)}</span>
        </div>
        <button onClick={nextMonth} disabled={isCurrentMonth} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Payroll', value: formatCurrency(totalNet), icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
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
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground font-semibold text-sm">
              {salaries.length} Record{salaries.length !== 1 ? 's' : ''}
            </span>
          </div>
          {salaries.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="text-emerald-400 font-medium">{salaries.filter(s => s.status === 'paid').length} paid</span>
              <span>·</span>
              <span className="text-amber-400 font-medium">{salaries.filter(s => s.status === 'pending').length} pending</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="w-6 h-6 text-primary animate-spin mb-3" />
            <p className="text-muted-foreground text-sm">Loading salary records…</p>
          </div>
        ) : salaries.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <TrendingUp className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <p className="text-foreground font-semibold">No salary records</p>
            <p className="text-muted-foreground text-sm mt-1">Add salary records for {getMonthLabel(currentMonth)}.</p>
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Record
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Staff</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Base</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Bonus</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Deductions</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Net</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {salaries.map(s => (
                  <SalaryRow key={s.id} salary={s} onRefresh={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
