'use client'

import { useState } from 'react'
import { FileSpreadsheet, Download, Loader2, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { getDocumentCenterData } from '@/app/actions/documents'
import { formatDate } from '@/lib/utils'

type DatasetKey =
  | 'members' | 'memberships' | 'payments' | 'coaches'
  | 'staffSalaries' | 'whatsappLogs' | 'attendanceLogs' | 'membershipPlans'

const DATASETS: { key: DatasetKey; label: string; adminOnly?: boolean }[] = [
  { key: 'members',         label: 'Members' },
  { key: 'memberships',     label: 'Memberships' },
  { key: 'payments',        label: 'Payments' },
  { key: 'coaches',         label: 'Coaches' },
  { key: 'staffSalaries',   label: 'Staff Salaries', adminOnly: true },
  { key: 'whatsappLogs',    label: 'WhatsApp Logs' },
  { key: 'attendanceLogs',  label: 'Attendance Logs' },
  { key: 'membershipPlans', label: 'Membership Plans' },
]

function defaultRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

export default function DocumentCenterPage() {
  const [range, setRange] = useState(defaultRange())
  const [selected, setSelected] = useState<Set<DatasetKey>>(new Set(DATASETS.map(d => d.key)))
  const [downloading, setDownloading] = useState(false)

  const toggle = (key: DatasetKey) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleDownload() {
    if (selected.size === 0) {
      toast.error('Select at least one dataset to export')
      return
    }
    if (range.start > range.end) {
      toast.error('"From" date must be before "To" date')
      return
    }

    setDownloading(true)
    try {
      const [res, XLSX] = await Promise.all([
        getDocumentCenterData(range.start, range.end),
        import('xlsx'),
      ])
      if (res.error || !res.data) {
        toast.error(res.error ?? 'Failed to load data')
        return
      }
      const data = res.data
      const wb = XLSX.utils.book_new()
      let sheetCount = 0

      const addSheet = (rows: Record<string, unknown>[], name: string) => {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name)
        sheetCount++
      }

      if (selected.has('members')) {
        addSheet(data.members.map(m => ({
          'Member ID':      m.member_id,
          'Name':           m.full_name,
          'Mobile':         m.mobile,
          'Email':          m.email ?? '',
          'Gender':         m.gender,
          'Join Date':      formatDate(m.join_date),
          'Admission Fee':  m.admission_fee ?? 0,
          'Notes':          m.notes ?? '',
        })), 'Members')
      }

      if (selected.has('memberships')) {
        addSheet(data.memberships.map(m => ({
          'Member ID':   m.member?.member_id ?? '',
          'Member Name': m.member?.full_name ?? '',
          'Start Date':  formatDate(m.start_date),
          'Expiry Date': formatDate(m.expiry_date),
          'Amount':      m.amount,
          'Status':      m.status,
        })), 'Memberships')
      }

      if (selected.has('payments')) {
        addSheet(data.payments.map(p => ({
          'Member ID':   p.member?.member_id ?? '',
          'Member Name': p.member?.full_name ?? '',
          'Date':        formatDate(p.payment_date),
          'Receipt':     p.receipt_number ?? '',
          'Amount':      p.amount,
          'Method':      p.payment_method,
          'Type':        p.payment_type ?? '',
          'Notes':       p.notes ?? '',
        })), 'Payments')
      }

      if (selected.has('coaches')) {
        addSheet(data.coaches.map(c => ({
          'Coach ID':       c.coach_id,
          'Name':           c.name,
          'Mobile':         c.mobile,
          'Email':          c.email ?? '',
          'Specialization': c.specialization ?? '',
          'Active':         c.is_active ? 'Yes' : 'No',
        })), 'Coaches')
      }

      if (selected.has('staffSalaries')) {
        addSheet(data.staffSalaries.map(s => ({
          'Staff Name':   s.staff_name,
          'Type':         s.staff_type,
          'Month':        formatDate(s.month),
          'Base Salary':  s.base_salary,
          'Bonus':        s.bonus,
          'Deductions':   s.deductions,
          'Net Salary':   s.net_salary,
          'Status':       s.status,
          'Paid At':      s.paid_at ? formatDate(s.paid_at) : '',
        })), 'Staff Salaries')
      }

      if (selected.has('whatsappLogs')) {
        addSheet(data.whatsappLogs.map(w => ({
          'Member ID':   w.member?.member_id ?? '',
          'Member Name': w.member?.full_name ?? '',
          'Phone':       w.phone,
          'Type':        w.message_type,
          'Sent At':     formatDate(w.sent_at),
          'Status':      w.status,
        })), 'WhatsApp Logs')
      }

      if (selected.has('attendanceLogs')) {
        addSheet(data.attendanceLogs.map(a => ({
          'Member ID':   a.member?.member_id ?? '',
          'Member Name': a.member?.full_name ?? '',
          'Punched At':  a.punched_at,
          'Punch Type':  a.punch_type === 0 ? 'Check In' : a.punch_type === 1 ? 'Check Out' : `Type ${a.punch_type}`,
        })), 'Attendance Logs')
      }

      if (selected.has('membershipPlans')) {
        addSheet(data.membershipPlans.map(p => ({
          'Name':              p.name,
          'Duration (Months)': p.duration_months,
          'Fee':                p.fee,
          'Description':        p.description ?? '',
          'Active':             p.is_active ? 'Yes' : 'No',
        })), 'Membership Plans')
      }

      if (sheetCount === 0) {
        toast.error('No data found for the selected range')
        return
      }

      XLSX.writeFile(wb, `gym-data_${range.start}_to_${range.end}.xlsx`)
      toast.success('Export downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <FileSpreadsheet className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Document Center</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Export your gym&apos;s data to a single Excel file for any date range
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">From</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
              <input
                type="date"
                value={range.start}
                onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
                className="w-full pl-9 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">To</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
              <input
                type="date"
                value={range.end}
                onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
                className="w-full pl-9 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">Datasets to include</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DATASETS.map(d => (
              <label
                key={d.key}
                className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-xl text-sm cursor-pointer hover:border-muted-foreground/30 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.has(d.key)}
                  onChange={() => toggle(d.key)}
                  className="accent-primary"
                />
                <span className="text-foreground">{d.label}</span>
                {d.adminOnly && <span className="text-[10px] text-muted-foreground/60 ml-auto">Admin</span>}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/50">
            Coaches and Membership Plans always export in full — they&apos;re small reference lists, not date-filtered.
          </p>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? 'Preparing…' : 'Download Excel'}
        </button>
      </div>
    </div>
  )
}
